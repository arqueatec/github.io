import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import type { DB, Exec } from "@/db";
import {
  animalCategoryChanges,
  animalExits,
  animals,
  births,
  breedings,
  expenses,
  healthEvents,
  lotChanges,
  lots,
  pregnancyChecks,
  weanings,
  weighings,
  users,
} from "@/db/schema";
import { birthFromAgeMonths, formatDateBR, todayIso } from "@/domain/dates";
import { assert, canWriteHerd, type Actor } from "@/domain/policy";
import { animalCreateSchema, animalUpdateSchema, type AnimalCreate } from "@/lib/schemas";
import { AppError, ConflictError, NotFoundError, isUniqueViolation } from "../errors";
import { audit } from "./audit";
import { findAnimalByTag, saveAttachment } from "./common";

type Category = (typeof animals.$inferSelect)["category"];

async function resolveParent(db: Exec, tag: string | null | undefined, sex: "M" | "F", selfTag?: string) {
  if (!tag) return null;
  if (selfTag && tag.toLowerCase() === selfTag.toLowerCase()) throw new AppError("O animal não pode ser pai/mãe de si mesmo");
  const p = await findAnimalByTag(db, tag);
  if (!p) throw new NotFoundError(`${sex === "F" ? "Mãe" : "Pai"} com brinco ${tag} não encontrado(a)`);
  if (p.sex !== sex) throw new AppError(`Brinco ${tag} não é ${sex === "F" ? "fêmea" : "macho"}`);
  return p.id;
}

/** Cria um animal dentro de uma transação. Usado pelo cadastro, inventário, parto e importação. */
export async function insertAnimal(tx: Exec, actor: Actor, input: AnimalCreate & { birthId?: number | null }) {
  const today = todayIso();
  const existing = await findAnimalByTag(tx, input.tag);
  if (existing) throw new ConflictError(`Brinco ${input.tag} já cadastrado`, { animalId: existing.id });
  let birthDate = input.birthDate ?? null;
  let estimated = input.birthDateEstimated ?? false;
  const entryDate = input.entryDate ?? today;
  if (!birthDate && input.ageMonths !== null && input.ageMonths !== undefined) {
    birthDate = birthFromAgeMonths(input.ageMonths, entryDate);
    estimated = true;
  }
  if (birthDate && birthDate > today) throw new AppError("Data de nascimento no futuro");
  if (birthDate && birthDate > entryDate) throw new AppError("Nascimento posterior à data de entrada");
  const [row] = await tx
    .insert(animals)
    .values({
      clientRef: input.clientRef ?? null,
      tag: input.tag,
      sex: input.sex,
      breed: input.breed ?? null,
      birthDate,
      birthDateEstimated: estimated,
      motherId: await resolveParent(tx, input.motherTag, "F", input.tag),
      fatherId: await resolveParent(tx, input.fatherTag, "M", input.tag),
      birthId: input.birthId ?? null,
      category: input.category,
      lotId: input.lotId ?? null,
      origin: input.origin ?? "inventario",
      entryDate,
      photoId: await saveAttachment(tx, input.photo, actor.id),
      notes: input.notes ?? null,
      createdBy: actor.id,
    })
    .returning();
  await tx.insert(animalCategoryChanges).values({
    animalId: row.id,
    date: entryDate,
    fromCategory: null,
    toCategory: input.category,
    createdBy: actor.id,
  });
  return row;
}

export async function createAnimal(db: DB, actor: Actor, raw: unknown) {
  assert(canWriteHerd(actor));
  const input = animalCreateSchema.parse(raw);
  try {
    return await db.transaction(async (tx) => {
      if (input.clientRef) {
        const [dup] = await tx.select().from(animals).where(eq(animals.clientRef, input.clientRef));
        if (dup) return { id: dup.id, tag: dup.tag, duplicate: true };
      }
      const row = await insertAnimal(tx, actor, input);
      await audit(tx, actor.id, "animal", row.id, "create", null, row);
      return { id: row.id, tag: row.tag, duplicate: false };
    });
  } catch (e) {
    if (isUniqueViolation(e, "tag")) throw new ConflictError(`Brinco ${input.tag} já cadastrado`);
    if (input.clientRef && isUniqueViolation(e, "client_ref")) {
      const [dup] = await db.select().from(animals).where(eq(animals.clientRef, input.clientRef));
      if (dup) return { id: dup.id, tag: dup.tag, duplicate: true };
    }
    throw e;
  }
}

export async function updateAnimal(db: DB, actor: Actor, id: number, raw: unknown) {
  assert(canWriteHerd(actor));
  const input = animalUpdateSchema.parse(raw);
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx.select().from(animals).where(eq(animals.id, id)).for("update");
      if (!before) throw new NotFoundError("Animal não encontrado");
      const changeDate = input.changeDate ?? todayIso();
      const patch: Partial<typeof animals.$inferInsert> = { updatedAt: new Date() };
      if (input.tag && input.tag !== before.tag) {
        const other = await findAnimalByTag(tx, input.tag);
        if (other && other.id !== id) throw new ConflictError(`Brinco ${input.tag} já cadastrado`);
        patch.tag = input.tag;
      }
      if (input.sex) patch.sex = input.sex;
      if (input.breed !== undefined) patch.breed = input.breed;
      if (input.birthDate !== undefined) patch.birthDate = input.birthDate;
      if (input.birthDateEstimated !== undefined) patch.birthDateEstimated = input.birthDateEstimated;
      if (input.motherTag !== undefined) patch.motherId = await resolveParent(tx, input.motherTag, "F", before.tag);
      if (input.fatherTag !== undefined) patch.fatherId = await resolveParent(tx, input.fatherTag, "M", before.tag);
      if (input.entryDate) patch.entryDate = input.entryDate;
      if (input.notes !== undefined) patch.notes = input.notes;
      if (input.photo) patch.photoId = await saveAttachment(tx, input.photo, actor.id);
      const sex = input.sex ?? before.sex;
      const category = input.category ?? before.category;
      if (category === "matriz" && sex === "M") throw new AppError("Matriz deve ser fêmea");
      if (category === "reprodutor" && sex === "F") throw new AppError("Reprodutor deve ser macho");
      if (input.category && input.category !== before.category) {
        patch.category = input.category;
        await recordCategoryChange(tx, actor, id, before.category, input.category, changeDate);
      }
      if (input.lotId !== undefined && (input.lotId ?? null) !== before.lotId) {
        patch.lotId = input.lotId ?? null;
        await tx.insert(lotChanges).values({
          animalId: id,
          date: changeDate,
          fromLotId: before.lotId,
          toLotId: input.lotId ?? null,
          createdBy: actor.id,
        });
      }
      const [after] = await tx.update(animals).set(patch).where(eq(animals.id, id)).returning();
      await audit(tx, actor.id, "animal", id, "update", before, after);
      return after;
    });
  } catch (e) {
    if (isUniqueViolation(e, "tag")) throw new ConflictError(`Brinco ${input.tag} já cadastrado`);
    throw e;
  }
}

export async function recordCategoryChange(tx: Exec, actor: Actor, animalId: number, from: Category, to: Category, date: string) {
  await tx.insert(animalCategoryChanges).values({ animalId, date, fromCategory: from, toCategory: to, createdBy: actor.id });
}

/** Exclui um animal cadastrado por engano (somente sem eventos vinculados). */
export async function deleteAnimal(db: DB, actor: Actor, id: number) {
  assert(canWriteHerd(actor));
  return db.transaction(async (tx) => {
    const [a] = await tx.select().from(animals).where(eq(animals.id, id)).for("update");
    if (!a) throw new NotFoundError("Animal não encontrado");
    const checks = await Promise.all([
      tx.select({ n: sql<number>`count(*)::int` }).from(births).where(eq(births.eweId, id)),
      tx.select({ n: sql<number>`count(*)::int` }).from(animals).where(or(eq(animals.motherId, id), eq(animals.fatherId, id))),
      tx.select({ n: sql<number>`count(*)::int` }).from(animalExits).where(eq(animalExits.animalId, id)),
      tx.select({ n: sql<number>`count(*)::int` }).from(expenses).where(eq(expenses.animalId, id)),
    ]);
    if (checks.some((c) => c[0].n > 0))
      throw new AppError("Animal possui partos, crias, baixa ou despesas vinculadas — não pode ser excluído. Registre uma baixa.");
    await tx.delete(animals).where(eq(animals.id, id));
    await audit(tx, actor.id, "animal", id, "delete", a, null);
  });
}

// ---------------------------------------------------------------- Consultas

export interface AnimalFilter {
  q?: string | null;
  status?: string | null;
  category?: string | null;
  sex?: string | null;
  lotId?: number | null;
}

export async function listAnimals(db: Exec, f: AnimalFilter = {}) {
  const conds: SQL[] = [];
  if (f.q) conds.push(or(ilike(animals.tag, `%${f.q}%`), ilike(animals.notes, `%${f.q}%`))!);
  if (f.status && f.status !== "todos") conds.push(eq(animals.status, f.status as "ativo"));
  if (f.category) conds.push(eq(animals.category, f.category as Category));
  if (f.sex) conds.push(eq(animals.sex, f.sex as "M"));
  if (f.lotId) conds.push(eq(animals.lotId, f.lotId));
  return db
    .select({
      id: animals.id,
      tag: animals.tag,
      sex: animals.sex,
      breed: animals.breed,
      category: animals.category,
      status: animals.status,
      birthDate: animals.birthDate,
      birthDateEstimated: animals.birthDateEstimated,
      lotId: animals.lotId,
      lotName: lots.name,
      entryDate: animals.entryDate,
      exitDate: animals.exitDate,
      motherId: animals.motherId,
      origin: animals.origin,
    })
    .from(animals)
    .leftJoin(lots, eq(lots.id, animals.lotId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(sql`length(${animals.tag})`, asc(animals.tag));
}

export async function allTags(db: Exec) {
  return db
    .select({ id: animals.id, tag: animals.tag, sex: animals.sex, category: animals.category, status: animals.status })
    .from(animals)
    .orderBy(sql`length(${animals.tag})`, asc(animals.tag));
}

export async function getAnimal(db: Exec, id: number) {
  const [a] = await db
    .select({ a: animals, lotName: lots.name })
    .from(animals)
    .leftJoin(lots, eq(lots.id, animals.lotId))
    .where(eq(animals.id, id));
  return a ? { ...a.a, lotName: a.lotName } : null;
}

async function brief(db: Exec, ids: (number | null)[]) {
  const list = ids.filter((x): x is number => !!x);
  if (!list.length) return new Map<number, { id: number; tag: string; sex: "M" | "F"; motherId: number | null; fatherId: number | null }>();
  const rows = await db
    .select({ id: animals.id, tag: animals.tag, sex: animals.sex, motherId: animals.motherId, fatherId: animals.fatherId })
    .from(animals)
    .where(inArray(animals.id, list));
  return new Map(rows.map((r) => [r.id, r]));
}

/** Genealogia: pais, avós e descendentes diretos. */
export async function genealogy(db: Exec, id: number) {
  const a = await getAnimal(db, id);
  if (!a) return null;
  const parents = await brief(db, [a.motherId, a.fatherId]);
  const mother = a.motherId ? parents.get(a.motherId) ?? null : null;
  const father = a.fatherId ? parents.get(a.fatherId) ?? null : null;
  const gp = await brief(db, [mother?.motherId ?? null, mother?.fatherId ?? null, father?.motherId ?? null, father?.fatherId ?? null]);
  const offspring = await db
    .select({ id: animals.id, tag: animals.tag, sex: animals.sex, birthDate: animals.birthDate, status: animals.status, category: animals.category })
    .from(animals)
    .where(or(eq(animals.motherId, id), eq(animals.fatherId, id)))
    .orderBy(desc(animals.birthDate));
  const g = (x: number | null | undefined) => (x ? gp.get(x) ?? null : null);
  return {
    mother,
    father,
    maternalGrandmother: g(mother?.motherId),
    maternalGrandfather: g(mother?.fatherId),
    paternalGrandmother: g(father?.motherId),
    paternalGrandfather: g(father?.fatherId),
    offspring,
  };
}

export type TimelineItem = { date: string; kind: string; title: string; detail?: string | null; href?: string; at?: Date };

/** Histórico completo do animal (todos os eventos em ordem cronológica decrescente). */
export async function animalTimeline(db: Exec, id: number): Promise<TimelineItem[]> {
  const ram = sql<string | null>`(select tag from animals r where r.id = ${breedings.ramId})`;
  const [cats, lotsCh, brs, pcs, bth, wean, hl, wg, ex, exp, born] = await Promise.all([
    db.select().from(animalCategoryChanges).where(eq(animalCategoryChanges.animalId, id)),
    db
      .select({ date: lotChanges.date, to: lots.name })
      .from(lotChanges)
      .leftJoin(lots, eq(lots.id, lotChanges.toLotId))
      .where(eq(lotChanges.animalId, id)),
    db.select({ b: breedings, ram }).from(breedings).where(eq(breedings.eweId, id)),
    db.select().from(pregnancyChecks).where(eq(pregnancyChecks.eweId, id)),
    db.select().from(births).where(eq(births.eweId, id)),
    db.select().from(weanings).where(eq(weanings.animalId, id)),
    db.select().from(healthEvents).where(eq(healthEvents.animalId, id)),
    db.select().from(weighings).where(eq(weighings.animalId, id)),
    db.select().from(animalExits).where(eq(animalExits.animalId, id)),
    db
      .select({ e: expenses, by: users.name })
      .from(expenses)
      .innerJoin(users, eq(users.id, expenses.paidByUserId))
      .where(and(eq(expenses.animalId, id), sql`${expenses.deletedAt} is null`)),
    db.select().from(animals).where(eq(animals.id, id)),
  ]);
  const items: TimelineItem[] = [];
  const a = born[0];
  if (a) items.push({ date: a.entryDate, kind: "entrada", title: `Entrada no sistema (${a.origin})` });
  for (const c of cats)
    if (c.fromCategory) items.push({ date: c.date, kind: "categoria", title: `Categoria: ${c.fromCategory} → ${c.toCategory}` });
  for (const l of lotsCh) items.push({ date: l.date, kind: "lote", title: `Mudou para o lote ${l.to ?? "(sem lote)"}` });
  for (const { b, ram: r } of brs)
    items.push({ date: b.date, kind: "cobertura", title: `Cobertura${r ? ` com ${r}` : ""}`, detail: b.seasonName ?? b.notes });
  for (const p of pcs) items.push({ date: p.date, kind: "diagnostico", title: `Diagnóstico de gestação: ${p.result}`, detail: p.notes });
  for (const b of bth)
    items.push({
      date: b.date,
      kind: "parto",
      title: `Parto (${b.birthType}): ${b.bornAlive} viva(s), ${b.bornDead} morta(s)`,
      detail: b.notes,
    });
  for (const w of wean)
    items.push({ date: w.date, kind: "desmame", title: `Desmame${w.weightG ? ` — ${(w.weightG / 1000).toFixed(1)} kg` : ""}` });
  for (const h of hl)
    items.push({
      date: h.date,
      kind: h.type,
      title: `${h.type === "vermifugacao" ? "Vermifugação" : h.type[0].toUpperCase() + h.type.slice(1)}: ${h.product ?? "—"}`,
      detail: [
        h.dose && `dose ${h.dose}`,
        h.famacha && `FAMACHA ${h.famacha}`,
        h.withdrawalUntil && `carência até ${formatDateBR(h.withdrawalUntil)}`,
        h.nextDoseDate && `próxima dose ${formatDateBR(h.nextDoseDate)}`,
        h.notes,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  for (const w of wg)
    items.push({
      date: w.date,
      kind: "pesagem",
      title: `Pesagem${w.weightG ? `: ${(w.weightG / 1000).toFixed(1)} kg` : ""}${w.bodyScore ? ` · ECC ${w.bodyScore}` : ""}`,
    });
  for (const e of ex)
    items.push({
      date: e.date,
      kind: "baixa",
      title: `Baixa: ${e.type.replace("_", " ")}`,
      detail: [e.cause, e.buyer && `comprador ${e.buyer}`].filter(Boolean).join(" · "),
    });
  for (const { e, by } of exp)
    items.push({
      date: e.date,
      kind: "despesa",
      title: `Despesa: R$ ${(e.amountCents / 100).toFixed(2).replace(".", ",")}`,
      detail: `${e.description ?? ""} (pago por ${by})`,
    });
  return items.sort((x, y) => (x.date === y.date ? 0 : x.date < y.date ? 1 : -1));
}
