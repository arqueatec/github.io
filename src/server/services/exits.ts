import { and, desc, eq, sql } from "drizzle-orm";
import type { DB, Exec } from "@/db";
import { animalExits, animals, categories, revenues } from "@/db/schema";
import { todayIso } from "@/domain/dates";
import { mulFrac } from "@/domain/money";
import { assert, assertDecision, canModifyFinancial, canWriteHerd, type Actor } from "@/domain/policy";
import { exitCreateSchema, saleCreateSchema } from "@/lib/schemas";
import { AppError, NotFoundError } from "../errors";
import { audit } from "./audit";
import { animalsByTags, requireAnimalByTag } from "./common";
import { insertRevenue } from "./finance";
import { activeWithdrawal } from "./health";
import { getLockedUntil } from "./locks";

const STATUS_BY_TYPE = { venda: "vendido", morte: "morto", abate: "abatido", consumo_proprio: "consumo_proprio" } as const;

type AnimalRow = typeof animals.$inferSelect;

async function checkCanExit(tx: Exec, a: AnimalRow, type: keyof typeof STATUS_BY_TYPE, date: string, ignoreWithdrawal?: boolean) {
  if (a.status !== "ativo") throw new AppError(`Animal ${a.tag} já tem baixa (${a.status})`);
  if (date > todayIso()) throw new AppError("Data da baixa no futuro");
  if (date < a.entryDate) throw new AppError(`Baixa de ${a.tag} antes da entrada no rebanho (${a.entryDate})`);
  if (type !== "morte" && !ignoreWithdrawal) {
    const w = await activeWithdrawal(tx, a.id, date);
    if (w)
      throw new AppError(
        `Animal ${a.tag} em período de carência de ${w.product ?? "medicamento"} até ${w.until}. Confirme para prosseguir mesmo assim.`,
        422,
        { code: "carencia" },
      );
  }
}

async function applyExit(
  tx: Exec,
  actor: Actor,
  a: AnimalRow,
  data: Omit<typeof animalExits.$inferInsert, "animalId" | "previousCategory" | "createdBy">,
) {
  const [row] = await tx
    .insert(animalExits)
    .values({ ...data, animalId: a.id, previousCategory: a.category, createdBy: actor.id })
    .returning();
  await tx
    .update(animals)
    .set({ status: STATUS_BY_TYPE[data.type], exitDate: data.date, updatedAt: new Date() })
    .where(eq(animals.id, a.id));
  await audit(tx, actor.id, "animal_exit", row.id, "create", { animal: a }, row);
  return row;
}

/** Morte, abate ou consumo próprio de um animal. */
export async function registerExit(db: DB, actor: Actor, raw: unknown) {
  assert(canWriteHerd(actor));
  const input = exitCreateSchema.parse(raw);
  return db.transaction(async (tx) => {
    if (input.clientRef) {
      const [dup] = await tx.select({ id: animalExits.id }).from(animalExits).where(eq(animalExits.clientRef, input.clientRef));
      if (dup) return { id: dup.id, duplicate: true };
    }
    const a = await requireAnimalByTag(tx, input.tag);
    await checkCanExit(tx, a, input.type, input.date, input.ignoreWithdrawal);
    if (input.type === "morte" && !input.cause) throw new AppError("Informe a causa da morte (ou 'desconhecida')");
    const row = await applyExit(tx, actor, a, {
      clientRef: input.clientRef ?? null,
      type: input.type,
      date: input.date,
      cause: input.cause ?? null,
      weightG: input.weightKg ? Math.round(input.weightKg * 1000) : null,
      notes: input.notes ?? null,
    });
    return { id: row.id, duplicate: false };
  });
}

/** Venda de um ou mais animais, opcionalmente gerando a receita correspondente. */
export async function registerSale(db: DB, actor: Actor, raw: unknown) {
  assert(canWriteHerd(actor));
  const input = saleCreateSchema.parse(raw);
  return db.transaction(async (tx) => {
    if (input.clientRef) {
      const [dup] = await tx.select({ id: animalExits.id }).from(animalExits).where(eq(animalExits.clientRef, input.clientRef));
      if (dup) return { duplicate: true, exitIds: [dup.id], revenueId: null, totalCents: 0 };
    }
    const list = await animalsByTags(tx, input.items.map((i) => i.tag));
    const byTag = new Map(list.map((a) => [a.tag.toLowerCase(), a]));
    if (byTag.size !== input.items.length) throw new AppError("Brinco repetido na venda");
    // preço por animal, em centavos inteiros
    const priced = input.items.map((i) => {
      const a = byTag.get(i.tag.toLowerCase())!;
      const weightG = i.weightKg ? Math.round(i.weightKg * 1000) : null;
      const total = input.priceMode === "kg" ? mulFrac(input.unitPriceCents, weightG!, 1000) : input.unitPriceCents;
      return { a, weightG, total };
    });
    for (const p of priced) await checkCanExit(tx, p.a, "venda", input.date, input.ignoreWithdrawal);
    const totalCents = priced.reduce((s, p) => s + p.total, 0);

    let revenueId: number | null = null;
    if (input.createRevenue) {
      const [cat] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.kind, "receita"), sql`lower(${categories.name}) like 'venda de animais%'`))
        .limit(1);
      if (!cat) throw new AppError("Categoria de receita 'Venda de animais' não encontrada");
      revenueId = await insertRevenue(tx, actor, {
        date: input.date,
        amountCents: totalCents,
        categoryId: cat.id,
        description: `Venda de ${priced.length} animal(is) para ${input.buyer}: ${priced.map((p) => p.a.tag).join(", ")}`,
        receivedByUserId: input.receivedByUserId ?? actor.id,
      });
    }
    const exitIds: number[] = [];
    for (const [idx, p] of priced.entries()) {
      const row = await applyExit(tx, actor, p.a, {
        clientRef: idx === 0 ? input.clientRef ?? null : null,
        type: "venda",
        date: input.date,
        buyer: input.buyer,
        weightG: p.weightG,
        priceMode: input.priceMode,
        unitPriceCents: input.unitPriceCents,
        totalCents: p.total,
        revenueId,
        notes: input.notes ?? null,
      });
      exitIds.push(row.id);
    }
    return { duplicate: false, exitIds, revenueId, totalCents };
  });
}

/** Desfaz uma baixa lançada por engano (o animal volta a ativo). */
export async function undoExit(db: DB, actor: Actor, exitId: number) {
  assert(canWriteHerd(actor));
  return db.transaction(async (tx) => {
    const [ex] = await tx.select().from(animalExits).where(eq(animalExits.id, exitId)).for("update");
    if (!ex) throw new NotFoundError("Baixa não encontrada");
    if (ex.revenueId) {
      const [rev] = await tx.select().from(revenues).where(eq(revenues.id, ex.revenueId));
      if (rev && !rev.deletedAt) {
        const siblings = await tx
          .select({ id: animalExits.id })
          .from(animalExits)
          .where(eq(animalExits.revenueId, ex.revenueId));
        if (siblings.length > 1)
          throw new AppError("Esta baixa faz parte de uma venda com vários animais e receita lançada. Exclua a receita da venda primeiro.");
        assertDecision(canModifyFinancial(actor, rev, await getLockedUntil(tx)));
        await tx.update(revenues).set({ deletedAt: new Date() }).where(eq(revenues.id, rev.id));
        await audit(tx, actor.id, "revenue", rev.id, "delete", rev, { motivo: "baixa desfeita" });
      }
    }
    await tx.delete(animalExits).where(eq(animalExits.id, exitId));
    await tx.update(animals).set({ status: "ativo", exitDate: null, updatedAt: new Date() }).where(eq(animals.id, ex.animalId));
    await audit(tx, actor.id, "animal_exit", exitId, "delete", ex, null);
  });
}

export async function listExits(db: Exec, type?: string | null) {
  return db
    .select({
      id: animalExits.id,
      date: animalExits.date,
      type: animalExits.type,
      cause: animalExits.cause,
      buyer: animalExits.buyer,
      weightG: animalExits.weightG,
      priceMode: animalExits.priceMode,
      unitPriceCents: animalExits.unitPriceCents,
      totalCents: animalExits.totalCents,
      revenueId: animalExits.revenueId,
      animalId: animalExits.animalId,
      tag: animals.tag,
      birthDate: animals.birthDate,
      category: animalExits.previousCategory,
      revenueDeleted: sql<boolean>`exists(select 1 from revenues r where r.id = ${animalExits.revenueId} and r.deleted_at is not null)`,
    })
    .from(animalExits)
    .innerJoin(animals, eq(animals.id, animalExits.animalId))
    .where(type ? eq(animalExits.type, type as "venda") : undefined)
    .orderBy(desc(animalExits.date), desc(animalExits.id));
}

