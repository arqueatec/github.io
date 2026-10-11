import { and, desc, eq, sql } from "drizzle-orm";
import type { DB, Exec } from "@/db";
import { animals, inventoryCountItems, inventoryCounts, lots, settings, users } from "@/db/schema";
import { assert, canWriteHerd, type Actor } from "@/domain/policy";
import { countCreateSchema, countFinishSchema, countTagSchema } from "@/lib/schemas";
import { AppError, NotFoundError, isUniqueViolation } from "../errors";
import { audit } from "./audit";

export async function getSetting<T>(db: Exec, key: string, fallback: T): Promise<T> {
  const [r] = await db.select().from(settings).where(eq(settings.key, key));
  return (r?.value as T) ?? fallback;
}

export async function setSetting(db: Exec, key: string, value: unknown) {
  await db
    .insert(settings)
    .values({ key, value: value as object })
    .onConflictDoUpdate({ target: settings.key, set: { value: value as object } });
}

/** Progresso do inventário inicial: animais ativos por categoria × meta configurada. */
export async function inventoryProgress(db: Exec) {
  const target = await getSetting<number>(db, "inventory_target", 50);
  const rows = await db
    .select({ category: animals.category, sex: animals.sex, n: sql<number>`count(*)::int` })
    .from(animals)
    .where(eq(animals.status, "ativo"))
    .groupBy(animals.category, animals.sex);
  const [{ unknownBirth }] = await db
    .select({ unknownBirth: sql<number>`count(*) filter (where ${animals.birthDate} is null)::int` })
    .from(animals)
    .where(eq(animals.status, "ativo"));
  const [{ inventoried }] = await db
    .select({ inventoried: sql<number>`count(*)::int` })
    .from(animals)
    .where(and(eq(animals.status, "ativo"), eq(animals.origin, "inventario")));
  const total = rows.reduce((s, r) => s + r.n, 0);
  return { target, total, inventoried, unknownBirth, byCategory: rows };
}

export async function createCount(db: DB, actor: Actor, raw: unknown) {
  assert(canWriteHerd(actor));
  const input = countCreateSchema.parse(raw);
  const [open] = await db.select({ id: inventoryCounts.id }).from(inventoryCounts).where(eq(inventoryCounts.status, "aberta"));
  if (open) throw new AppError("Já existe uma recontagem aberta. Conclua-a antes de iniciar outra.");
  const [row] = await db
    .insert(inventoryCounts)
    .values({ date: input.date, lotId: input.lotId ?? null, notes: input.notes ?? null, createdBy: actor.id })
    .returning();
  return row;
}

async function requireOpenCount(db: Exec, id: number) {
  const [c] = await db.select().from(inventoryCounts).where(eq(inventoryCounts.id, id));
  if (!c) throw new NotFoundError("Recontagem não encontrada");
  if (c.status !== "aberta") throw new AppError("Recontagem já concluída");
  return c;
}

export async function addCountTag(db: DB, actor: Actor, countId: number, raw: unknown) {
  assert(canWriteHerd(actor));
  const { tag } = countTagSchema.parse(raw);
  await requireOpenCount(db, countId);
  try {
    await db.insert(inventoryCountItems).values({ countId, tag: tag.trim(), createdBy: actor.id });
    return { added: true };
  } catch (e) {
    if (isUniqueViolation(e)) return { added: false };
    throw e;
  }
}

export async function removeCountTag(db: DB, actor: Actor, countId: number, tag: string) {
  assert(canWriteHerd(actor));
  await requireOpenCount(db, countId);
  await db.delete(inventoryCountItems).where(and(eq(inventoryCountItems.countId, countId), eq(inventoryCountItems.tag, tag)));
}

/** Calcula divergências entre o efetivo do sistema e os brincos vistos. */
export async function countComparison(db: Exec, countId: number) {
  const [c] = await db.select().from(inventoryCounts).where(eq(inventoryCounts.id, countId));
  if (!c) throw new NotFoundError("Recontagem não encontrada");
  const seen = await db
    .select({ tag: inventoryCountItems.tag })
    .from(inventoryCountItems)
    .where(eq(inventoryCountItems.countId, countId))
    .orderBy(desc(inventoryCountItems.createdAt));
  const expected = await db
    .select({ id: animals.id, tag: animals.tag, category: animals.category })
    .from(animals)
    .where(and(eq(animals.status, "ativo"), c.lotId ? eq(animals.lotId, c.lotId) : undefined));
  const all = await db.select({ id: animals.id, tag: animals.tag, status: animals.status, lotId: animals.lotId }).from(animals);
  const allByTag = new Map(all.map((a) => [a.tag.toLowerCase(), a]));
  const seenSet = new Set(seen.map((s) => s.tag.toLowerCase()));
  const expectedSet = new Set(expected.map((e) => e.tag.toLowerCase()));
  const missing = expected.filter((e) => !seenSet.has(e.tag.toLowerCase()));
  const unexpected = seen
    .filter((s) => !expectedSet.has(s.tag.toLowerCase()))
    .map((s) => {
      const a = allByTag.get(s.tag.toLowerCase());
      return {
        tag: s.tag,
        animalId: a?.id ?? null,
        reason: !a ? "Não cadastrado" : a.status !== "ativo" ? `No sistema como ${a.status}` : "Cadastrado em outro lote",
      };
    });
  return { count: c, seen: seen.map((s) => s.tag), expectedTotal: expected.length, missing, unexpected };
}

export async function finishCount(db: DB, actor: Actor, countId: number, raw: unknown) {
  assert(canWriteHerd(actor));
  const input = countFinishSchema.parse(raw);
  await requireOpenCount(db, countId);
  const cmp = await countComparison(db, countId);
  const result = {
    expected: cmp.expectedTotal,
    seen: cmp.seen.length,
    missing: cmp.missing.map((m) => m.tag),
    unexpected: cmp.unexpected,
    resolution: input.resolution ?? null,
  };
  const [row] = await db
    .update(inventoryCounts)
    .set({ status: "concluida", result, closedAt: new Date() })
    .where(eq(inventoryCounts.id, countId))
    .returning();
  await audit(db, actor.id, "inventory_count", countId, "update", null, result);
  return row;
}

export async function listCounts(db: Exec) {
  return db
    .select({
      id: inventoryCounts.id,
      date: inventoryCounts.date,
      status: inventoryCounts.status,
      lotName: lots.name,
      result: inventoryCounts.result,
      createdByName: users.name,
      seen: sql<number>`(select count(*)::int from inventory_count_items i where i.count_id = ${inventoryCounts.id})`,
    })
    .from(inventoryCounts)
    .leftJoin(lots, eq(lots.id, inventoryCounts.lotId))
    .leftJoin(users, eq(users.id, inventoryCounts.createdBy))
    .orderBy(desc(inventoryCounts.date), desc(inventoryCounts.id));
}

