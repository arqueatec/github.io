import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Exec, DB } from "@/db";
import { periodLocks, users } from "@/db/schema";
import { describeBalance } from "@/domain/ledger";
import { assert, canClosePeriod, canReopenPeriod, type Actor } from "@/domain/policy";
import { todayIso } from "@/domain/dates";
import { lockCreateSchema, lockReopenSchema } from "@/lib/schemas";
import { AppError, NotFoundError } from "../errors";
import { audit } from "./audit";
import { computeBalance } from "./finance";

/** Data até a qual os lançamentos estão travados (maior fechamento não reaberto), ou null. */
export async function getLockedUntil(db: Exec): Promise<string | null> {
  const [r] = await db
    .select({ d: sql<string | null>`max(${periodLocks.lockedUntil})` })
    .from(periodLocks)
    .where(isNull(periodLocks.reopenedAt));
  return r?.d ?? null;
}

export async function listLocks(db: Exec) {
  return db
    .select({
      id: periodLocks.id,
      lockedUntil: periodLocks.lockedUntil,
      balanceCents: periodLocks.balanceCents,
      notes: periodLocks.notes,
      createdAt: periodLocks.createdAt,
      createdByName: users.name,
      reopenedAt: periodLocks.reopenedAt,
      reopenReason: periodLocks.reopenReason,
    })
    .from(periodLocks)
    .leftJoin(users, eq(users.id, periodLocks.createdBy))
    .orderBy(desc(periodLocks.lockedUntil), desc(periodLocks.id));
}

export async function closePeriod(db: DB, actor: Actor, raw: unknown) {
  assert(canClosePeriod(actor), "Sem permissão para fechar período");
  const input = lockCreateSchema.parse(raw);
  if (input.lockedUntil > todayIso()) throw new AppError("Não é possível fechar um período futuro");
  return db.transaction(async (tx) => {
    // serializa fechamentos concorrentes
    await tx.execute(sql`select pg_advisory_xact_lock(4242)`);
    const current = await getLockedUntil(tx);
    if (current && input.lockedUntil <= current) throw new AppError(`Já existe fechamento até ${current}`);
    const balance = await computeBalance(tx, input.lockedUntil);
    const [row] = await tx
      .insert(periodLocks)
      .values({ lockedUntil: input.lockedUntil, balanceCents: balance, notes: input.notes ?? null, createdBy: actor.id })
      .returning();
    await audit(tx, actor.id, "period_lock", row.id, "lock", null, { ...row, saldo: describeBalance(balance) });
    return row;
  });
}

export async function reopenPeriod(db: DB, actor: Actor, id: number, raw: unknown) {
  assert(canReopenPeriod(actor), "Somente o administrador pode reabrir um período fechado");
  const input = lockReopenSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [lock] = await tx.select().from(periodLocks).where(eq(periodLocks.id, id)).limit(1);
    if (!lock) throw new NotFoundError("Fechamento não encontrado");
    if (lock.reopenedAt) throw new AppError("Este fechamento já foi reaberto");
    // reabrir um fechamento reabre também os posteriores (senão o período continuaria travado)
    const affected = await tx
      .update(periodLocks)
      .set({ reopenedAt: new Date(), reopenedBy: actor.id, reopenReason: input.reason })
      .where(and(isNull(periodLocks.reopenedAt), sql`${periodLocks.lockedUntil} >= ${lock.lockedUntil}`))
      .returning();
    for (const a of affected) await audit(tx, actor.id, "period_lock", a.id, "reopen", lock, a);
    return affected;
  });
}

