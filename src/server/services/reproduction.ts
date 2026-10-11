import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { DB, Exec } from "@/db";
import { animals, births, breedings, pregnancyChecks, weanings } from "@/db/schema";
import { addDays, todayIso } from "@/domain/dates";
import { GESTATION_DAYS } from "@/domain/indices";
import { assert, canWriteHerd, type Actor } from "@/domain/policy";
import { birthCreateSchema, breedingCreateSchema, pregnancyCreateSchema, weaningCreateSchema } from "@/lib/schemas";
import { AppError, ConflictError, NotFoundError } from "../errors";
import { audit } from "./audit";
import { animalsByTags, findAnimalByTag, requireAnimalByTag } from "./common";
import { insertAnimal, recordCategoryChange } from "./animals";

type Dup = { duplicate: true; ids: number[] } | { duplicate: false; ids: number[] };

export async function createBreedings(db: DB, actor: Actor, raw: unknown): Promise<Dup> {
  assert(canWriteHerd(actor));
  const input = breedingCreateSchema.parse(raw);
  return db.transaction(async (tx) => {
    if (input.clientRef) {
      const dup = await tx.select({ id: breedings.id }).from(breedings).where(eq(breedings.clientRef, input.clientRef));
      if (dup.length) return { duplicate: true, ids: dup.map((d) => d.id) };
    }
    if (input.date > todayIso()) throw new AppError("Data da cobertura no futuro");
    if (input.endDate && input.endDate < input.date) throw new AppError("Fim da estação antes do início");
    const ram = input.ramTag ? await requireAnimalByTag(tx, input.ramTag, { sex: "M", label: "Reprodutor" }) : null;
    const ewes = await animalsByTags(tx, input.eweTags);
    for (const e of ewes) {
      if (e.sex !== "F") throw new AppError(`Brinco ${e.tag} não é fêmea`);
      if (e.status !== "ativo") throw new AppError(`Matriz ${e.tag} não está ativa`);
    }
    const ids: number[] = [];
    for (const [i, e] of ewes.entries()) {
      const [row] = await tx
        .insert(breedings)
        .values({
          // client_ref é único: aplica-se ao primeiro registro do lote para idempotência
          clientRef: i === 0 ? input.clientRef ?? null : null,
          eweId: e.id,
          ramId: ram?.id ?? null,
          date: input.date,
          endDate: input.endDate ?? null,
          method: input.method,
          seasonName: input.seasonName ?? null,
          notes: input.notes ?? null,
          createdBy: actor.id,
        })
        .returning({ id: breedings.id });
      ids.push(row.id);
    }
    return { duplicate: false, ids };
  });
}

export async function createPregnancyCheck(db: DB, actor: Actor, raw: unknown) {
  assert(canWriteHerd(actor));
  const input = pregnancyCreateSchema.parse(raw);
  return db.transaction(async (tx) => {
    if (input.clientRef) {
      const [dup] = await tx.select({ id: pregnancyChecks.id }).from(pregnancyChecks).where(eq(pregnancyChecks.clientRef, input.clientRef));
      if (dup) return { id: dup.id, duplicate: true };
    }
    const ewe = await requireAnimalByTag(tx, input.eweTag, { sex: "F", label: "Matriz" });
    const [row] = await tx
      .insert(pregnancyChecks)
      .values({
        clientRef: input.clientRef ?? null,
        eweId: ewe.id,
        date: input.date,
        result: input.result,
        method: input.method ?? null,
        fetusCount: input.fetusCount ?? null,
        notes: input.notes ?? null,
        createdBy: actor.id,
      })
      .returning({ id: pregnancyChecks.id });
    return { id: row.id, duplicate: false };
  });
}

/** Registra parto, cria os animais das crias com brinco e promove a mãe a matriz se necessário. */
export async function createBirth(db: DB, actor: Actor, raw: unknown) {
  assert(canWriteHerd(actor));
  const input = birthCreateSchema.parse(raw);
  return db.transaction(async (tx) => {
    if (input.clientRef) {
      const [dup] = await tx.select({ id: births.id }).from(births).where(eq(births.clientRef, input.clientRef));
      if (dup) return { id: dup.id, duplicate: true, lambIds: [] as number[] };
    }
    if (input.date > todayIso()) throw new AppError("Data do parto no futuro");
    const ewe = await requireAnimalByTag(tx, input.eweTag, { sex: "F", label: "Matriz" });
    if (ewe.status !== "ativo" && ewe.exitDate && ewe.exitDate < input.date)
      throw new AppError(`Matriz ${ewe.tag} já teve baixa em ${ewe.exitDate}`);
    let ramId: number | null = null;
    if (input.ramTag) ramId = (await requireAnimalByTag(tx, input.ramTag, { sex: "M", label: "Reprodutor" })).id;
    else {
      // pai presumido = reprodutor da última cobertura até 170 dias antes
      const [b] = await tx
        .select({ ramId: breedings.ramId })
        .from(breedings)
        .where(and(eq(breedings.eweId, ewe.id), lte(breedings.date, input.date), gte(breedings.date, addDays(input.date, -170))))
        .orderBy(desc(breedings.date))
        .limit(1);
      ramId = b?.ramId ?? null;
    }
    // evita parto duplicado da mesma matriz em menos de 60 dias
    const [near] = await tx
      .select({ id: births.id, date: births.date })
      .from(births)
      .where(and(eq(births.eweId, ewe.id), gte(births.date, addDays(input.date, -60)), lte(births.date, addDays(input.date, 60))));
    if (near) throw new ConflictError(`Já existe parto da matriz ${ewe.tag} em ${near.date}`);
    for (const l of input.lambs) {
      if (await findAnimalByTag(tx, l.tag)) throw new ConflictError(`Brinco ${l.tag} já cadastrado`);
    }
    const [row] = await tx
      .insert(births)
      .values({
        clientRef: input.clientRef ?? null,
        eweId: ewe.id,
        ramId,
        date: input.date,
        bornAlive: input.bornAlive,
        bornDead: input.bornDead,
        birthType: input.birthType,
        notes: input.notes ?? null,
        createdBy: actor.id,
      })
      .returning();
    const ramTag = ramId ? (await tx.select({ tag: animals.tag }).from(animals).where(eq(animals.id, ramId)))[0]?.tag : null;
    const lambIds: number[] = [];
    for (const l of input.lambs) {
      const lamb = await insertAnimal(tx, actor, {
        tag: l.tag,
        sex: l.sex,
        breed: ewe.breed,
        birthDate: input.date,
        motherTag: ewe.tag,
        fatherTag: ramTag ?? null,
        category: "cordeiro",
        lotId: input.lotId ?? ewe.lotId,
        origin: "nascimento",
        entryDate: input.date,
        notes: l.weightKg ? `Peso ao nascer: ${l.weightKg} kg` : null,
        birthId: row.id,
      });
      lambIds.push(lamb.id);
    }
    if (ewe.category !== "matriz" && ewe.category !== "descarte") {
      await recordCategoryChange(tx, actor, ewe.id, ewe.category, "matriz", input.date);
      await tx.update(animals).set({ category: "matriz", updatedAt: new Date() }).where(eq(animals.id, ewe.id));
    }
    await audit(tx, actor.id, "birth", row.id, "create", null, { ...row, lambIds });
    return { id: row.id, duplicate: false, lambIds };
  });
}

export async function deleteBirth(db: DB, actor: Actor, id: number) {
  assert(canWriteHerd(actor));
  return db.transaction(async (tx) => {
    const [b] = await tx.select().from(births).where(eq(births.id, id));
    if (!b) throw new NotFoundError("Parto não encontrado");
    const lambs = await tx.select({ id: animals.id }).from(animals).where(eq(animals.birthId, id));
    if (lambs.length) throw new AppError("Exclua ou desvincule as crias cadastradas antes de excluir o parto");
    await tx.delete(births).where(eq(births.id, id));
    await audit(tx, actor.id, "birth", id, "delete", b, null);
  });
}

export async function createWeanings(db: DB, actor: Actor, raw: unknown) {
  assert(canWriteHerd(actor));
  const input = weaningCreateSchema.parse(raw);
  return db.transaction(async (tx) => {
    if (input.clientRef) {
      const [dup] = await tx.select({ id: weanings.id }).from(weanings).where(eq(weanings.clientRef, input.clientRef));
      if (dup) return { duplicate: true, ids: [dup.id] };
    }
    const list = await animalsByTags(tx, input.items.map((i) => i.tag));
    const byTag = new Map(list.map((a) => [a.tag.toLowerCase(), a]));
    const ids: number[] = [];
    for (const [i, item] of input.items.entries()) {
      const a = byTag.get(item.tag.toLowerCase())!;
      if (a.birthDate && a.birthDate > input.date) throw new AppError(`Desmame de ${a.tag} antes do nascimento`);
      const [existing] = await tx.select({ id: weanings.id }).from(weanings).where(eq(weanings.animalId, a.id));
      if (existing) throw new ConflictError(`Cria ${a.tag} já tem desmame registrado`);
      const [row] = await tx
        .insert(weanings)
        .values({
          clientRef: i === 0 ? input.clientRef ?? null : null,
          animalId: a.id,
          date: input.date,
          weightG: item.weightKg ? Math.round(item.weightKg * 1000) : null,
          notes: input.notes ?? null,
          createdBy: actor.id,
        })
        .returning({ id: weanings.id });
      ids.push(row.id);
      if (input.promoteToBorrego && a.category === "cordeiro" && a.status === "ativo") {
        await recordCategoryChange(tx, actor, a.id, "cordeiro", "borrego", input.date);
        await tx.update(animals).set({ category: "borrego", updatedAt: new Date() }).where(eq(animals.id, a.id));
      }
    }
    return { duplicate: false, ids };
  });
}

// ---------------------------------------------------------------- Consultas

export async function listBreedings(db: Exec, limit = 200) {
  return db
    .select({
      id: breedings.id,
      date: breedings.date,
      endDate: breedings.endDate,
      eweId: breedings.eweId,
      eweTag: animals.tag,
      ramTag: sql<string | null>`(select tag from animals r where r.id = ${breedings.ramId})`,
      method: breedings.method,
      seasonName: breedings.seasonName,
    })
    .from(breedings)
    .innerJoin(animals, eq(animals.id, breedings.eweId))
    .orderBy(desc(breedings.date), asc(animals.tag))
    .limit(limit);
}

export async function listBirths(db: Exec, opts: { eweId?: number; limit?: number } = {}) {
  return db
    .select({
      id: births.id,
      date: births.date,
      eweId: births.eweId,
      eweTag: animals.tag,
      ramTag: sql<string | null>`(select tag from animals r where r.id = ${births.ramId})`,
      bornAlive: births.bornAlive,
      bornDead: births.bornDead,
      birthType: births.birthType,
      notes: births.notes,
      lambs: sql<string | null>`(select string_agg(c.tag, ', ' order by c.tag) from animals c where c.birth_id = ${births.id})`,
    })
    .from(births)
    .innerJoin(animals, eq(animals.id, births.eweId))
    .where(opts.eweId ? eq(births.eweId, opts.eweId) : undefined)
    .orderBy(desc(births.date))
    .limit(opts.limit ?? 500);
}

/**
 * Partos previstos: coberturas cuja previsão (cobertura + 150 d) ainda não teve parto
 * correspondente nem diagnóstico "vazia" posterior, em matrizes ativas.
 */
export async function expectedBirths(db: Exec, refDate = todayIso(), horizonDays = 60) {
  const rows = await db
    .select({
      breedingId: breedings.id,
      eweId: breedings.eweId,
      eweTag: animals.tag,
      date: breedings.date,
      endDate: breedings.endDate,
    })
    .from(breedings)
    .innerJoin(animals, eq(animals.id, breedings.eweId))
    .where(
      and(
        eq(animals.status, "ativo"),
        gte(breedings.date, addDays(refDate, -GESTATION_DAYS - 30)),
        sql`not exists (select 1 from births b where b.ewe_id = ${breedings.eweId} and b.date > ${breedings.date})`,
        sql`not exists (select 1 from pregnancy_checks p where p.ewe_id = ${breedings.eweId} and p.date > ${breedings.date} and p.result = 'vazia')`,
        sql`not exists (select 1 from breedings b2 where b2.ewe_id = ${breedings.eweId} and b2.date > ${breedings.date})`,
      ),
    )
    .orderBy(asc(breedings.date));
  return rows
    .map((r) => ({
      ...r,
      expected: addDays(r.date, GESTATION_DAYS),
      expectedEnd: r.endDate ? addDays(r.endDate, GESTATION_DAYS) : null,
    }))
    .filter((r) => r.expected <= addDays(refDate, horizonDays));
}

/** Crias ativas sem desmame registrado (para o formulário de desmame). */
export async function unweanedLambs(db: Exec) {
  return db
    .select({ id: animals.id, tag: animals.tag, sex: animals.sex, birthDate: animals.birthDate, motherId: animals.motherId })
    .from(animals)
    .leftJoin(weanings, eq(weanings.animalId, animals.id))
    .where(and(eq(animals.status, "ativo"), eq(animals.category, "cordeiro"), isNull(weanings.id)))
    .orderBy(asc(animals.birthDate));
}

