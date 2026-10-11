import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import type { DB, Exec } from "@/db";
import { animals, healthEvents, weighings } from "@/db/schema";
import { addDays, todayIso } from "@/domain/dates";
import { assert, canWriteHerd, type Actor } from "@/domain/policy";
import { healthCreateSchema, weighingCreateSchema } from "@/lib/schemas";
import { AppError, NotFoundError } from "../errors";
import { animalsByTags } from "./common";
import { expectedBirths } from "./reproduction";

export async function createHealthEvents(db: DB, actor: Actor, raw: unknown) {
  assert(canWriteHerd(actor));
  const input = healthCreateSchema.parse(raw);
  return db.transaction(async (tx) => {
    if (input.clientRef) {
      const dup = await tx.select({ id: healthEvents.id }).from(healthEvents).where(eq(healthEvents.clientRef, input.clientRef));
      if (dup.length) return { duplicate: true, count: 0 };
    }
    let targets: { id: number; famacha: number | null }[];
    if (input.items.length) {
      const list = await animalsByTags(tx, input.items.map((i) => i.tag));
      const byTag = new Map(list.map((a) => [a.tag.toLowerCase(), a]));
      targets = input.items.map((i) => {
        const a = byTag.get(i.tag.toLowerCase())!;
        if (a.status !== "ativo") throw new AppError(`Animal ${a.tag} não está ativo`);
        return { id: a.id, famacha: i.famacha ?? null };
      });
    } else {
      const list = await tx
        .select({ id: animals.id })
        .from(animals)
        .where(and(eq(animals.lotId, input.lotId!), eq(animals.status, "ativo")));
      if (!list.length) throw new AppError("Nenhum animal ativo no lote");
      targets = list.map((a) => ({ id: a.id, famacha: null }));
    }
    const batchId = randomUUID();
    const withdrawalUntil = input.withdrawalDays ? addDays(input.date, input.withdrawalDays) : null;
    await tx.insert(healthEvents).values(
      targets.map((t, i) => ({
        clientRef: i === 0 ? input.clientRef ?? null : null,
        batchId,
        animalId: t.id,
        type: input.type,
        date: input.date,
        product: input.product ?? null,
        dose: input.dose ?? null,
        famacha: t.famacha,
        withdrawalDays: input.withdrawalDays ?? null,
        withdrawalUntil,
        nextDoseDate: input.nextDoseDate ?? null,
        notes: input.notes ?? null,
        createdBy: actor.id,
      })),
    );
    return { duplicate: false, count: targets.length, batchId };
  });
}

export async function deleteHealthEvent(db: DB, actor: Actor, id: number) {
  assert(canWriteHerd(actor));
  const r = await db.delete(healthEvents).where(eq(healthEvents.id, id)).returning({ id: healthEvents.id });
  if (!r.length) throw new NotFoundError();
}

export async function createWeighings(db: DB, actor: Actor, raw: unknown) {
  assert(canWriteHerd(actor));
  const input = weighingCreateSchema.parse(raw);
  return db.transaction(async (tx) => {
    if (input.clientRef) {
      const dup = await tx.select({ id: weighings.id }).from(weighings).where(eq(weighings.clientRef, input.clientRef));
      if (dup.length) return { duplicate: true, count: 0 };
    }
    const list = await animalsByTags(tx, input.items.map((i) => i.tag));
    const byTag = new Map(list.map((a) => [a.tag.toLowerCase(), a]));
    const rows = input.items
      .filter((i) => i.weightKg || i.bodyScore)
      .map((i, idx) => ({
        clientRef: idx === 0 ? input.clientRef ?? null : null,
        animalId: byTag.get(i.tag.toLowerCase())!.id,
        date: input.date,
        weightG: i.weightKg ? Math.round(i.weightKg * 1000) : null,
        bodyScore: i.bodyScore ?? null,
        notes: input.notes ?? null,
        createdBy: actor.id,
      }));
    if (!rows.length) throw new AppError("Informe peso ou escore corporal de ao menos um animal");
    await tx.insert(weighings).values(rows);
    return { duplicate: false, count: rows.length };
  });
}

export async function listHealthEvents(db: Exec, limit = 300) {
  return db
    .select({
      id: healthEvents.id,
      batchId: healthEvents.batchId,
      date: healthEvents.date,
      type: healthEvents.type,
      product: healthEvents.product,
      dose: healthEvents.dose,
      famacha: healthEvents.famacha,
      withdrawalUntil: healthEvents.withdrawalUntil,
      nextDoseDate: healthEvents.nextDoseDate,
      animalId: healthEvents.animalId,
      tag: animals.tag,
      notes: healthEvents.notes,
    })
    .from(healthEvents)
    .innerJoin(animals, eq(animals.id, healthEvents.animalId))
    .orderBy(desc(healthEvents.date), desc(healthEvents.id))
    .limit(limit);
}

export async function listWeighings(db: Exec, animalId?: number) {
  return db
    .select({
      id: weighings.id,
      date: weighings.date,
      weightG: weighings.weightG,
      bodyScore: weighings.bodyScore,
      animalId: weighings.animalId,
      tag: animals.tag,
    })
    .from(weighings)
    .innerJoin(animals, eq(animals.id, weighings.animalId))
    .where(animalId ? eq(weighings.animalId, animalId) : undefined)
    .orderBy(desc(weighings.date))
    .limit(500);
}

/**
 * Alertas: próximas doses (vencidas ou nos próximos `days` dias, sem aplicação posterior do
 * mesmo produto), partos previstos e carências ativas.
 */
export async function getAlerts(db: Exec, refDate = todayIso(), days = 30) {
  const doses = await db
    .select({
      id: healthEvents.id,
      animalId: healthEvents.animalId,
      tag: animals.tag,
      type: healthEvents.type,
      product: healthEvents.product,
      nextDoseDate: healthEvents.nextDoseDate,
    })
    .from(healthEvents)
    .innerJoin(animals, eq(animals.id, healthEvents.animalId))
    .where(
      and(
        eq(animals.status, "ativo"),
        isNotNull(healthEvents.nextDoseDate),
        lte(healthEvents.nextDoseDate, addDays(refDate, days)),
        gte(healthEvents.nextDoseDate, addDays(refDate, -90)),
        sql`not exists (
          select 1 from health_events h2
          where h2.animal_id = ${healthEvents.animalId}
            and h2.type = ${healthEvents.type}
            and coalesce(h2.product,'') = coalesce(${healthEvents.product},'')
            and h2.date > ${healthEvents.date}
        )`,
      ),
    )
    .orderBy(asc(healthEvents.nextDoseDate), asc(animals.tag));

  // agrupa por produto + data para não listar 40 linhas iguais
  const grouped = new Map<string, { product: string; type: string; date: string; tags: { id: number; tag: string }[] }>();
  for (const d of doses) {
    const k = `${d.type}|${d.product ?? ""}|${d.nextDoseDate}`;
    const g = grouped.get(k) ?? { product: d.product ?? d.type, type: d.type, date: d.nextDoseDate!, tags: [] };
    g.tags.push({ id: d.animalId, tag: d.tag });
    grouped.set(k, g);
  }

  const withdrawals = await db
    .select({ animalId: healthEvents.animalId, tag: animals.tag, product: healthEvents.product, until: healthEvents.withdrawalUntil })
    .from(healthEvents)
    .innerJoin(animals, eq(animals.id, healthEvents.animalId))
    .where(and(eq(animals.status, "ativo"), gte(healthEvents.withdrawalUntil, refDate)))
    .orderBy(desc(healthEvents.withdrawalUntil));

  const births = await expectedBirths(db, refDate, days);
  return {
    doses: [...grouped.values()].map((g) => ({ ...g, overdue: g.date < refDate })),
    births: births.map((b) => ({ ...b, overdue: b.expected < refDate })),
    withdrawals,
  };
}

/** Carência ativa de um animal (bloqueia venda/abate até a data). */
export async function activeWithdrawal(db: Exec, animalId: number, date: string) {
  const [r] = await db
    .select({ until: healthEvents.withdrawalUntil, product: healthEvents.product })
    .from(healthEvents)
    .where(and(eq(healthEvents.animalId, animalId), gte(healthEvents.withdrawalUntil, date), lte(healthEvents.date, date)))
    .orderBy(desc(healthEvents.withdrawalUntil))
    .limit(1);
  return r ?? null;
}
