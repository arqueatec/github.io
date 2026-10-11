import { and, asc, desc, eq, gte, isNull, lte, sql, type SQL } from "drizzle-orm";
import type { DB, Exec } from "@/db";
import { animals, categories, expenses, lots, reimbursements, revenues, shareConfigs, users } from "@/db/schema";
import { buildLedger, partyTotals, type LedgerInput, type Party, type Share } from "@/domain/ledger";
import { assertDecision, canCreateFinancial, canModifyFinancial, type Actor } from "@/domain/policy";
import {
  expenseCreateSchema,
  expenseUpdateSchema,
  reimbursementCreateSchema,
  reimbursementUpdateSchema,
  revenueCreateSchema,
  revenueUpdateSchema,
} from "@/lib/schemas";
import { AppError, NotFoundError, isUniqueViolation } from "../errors";
import { audit } from "./audit";
import { findAnimalByTag, requireActiveUser, saveAttachment } from "./common";
import { getLockedUntil } from "./locks";

// ---------------------------------------------------------------- Participações

export async function getShares(db: Exec): Promise<Share[]> {
  const rows = await db.select().from(shareConfigs).orderBy(asc(shareConfigs.validFrom));
  return rows.map((r) => ({ validFrom: r.validFrom, num: r.shareANum, den: r.shareDen }));
}

async function requireCategory(db: Exec, id: number, kind: "despesa" | "receita") {
  const [c] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!c || c.kind !== kind) throw new AppError("Categoria inválida");
  if (!c.active) throw new AppError("Categoria desativada");
  return c;
}

async function requireLot(db: Exec, id: number | null | undefined) {
  if (!id) return null;
  const [l] = await db.select().from(lots).where(eq(lots.id, id)).limit(1);
  if (!l) throw new AppError("Lote inválido");
  return l.id;
}

async function resolveAnimalTag(db: Exec, tag: string | null | undefined) {
  if (!tag) return null;
  const a = await findAnimalByTag(db, tag);
  if (!a) throw new NotFoundError(`Animal com brinco ${tag} não encontrado`);
  return a.id;
}

type Created = { id: number; duplicate: boolean };

// ---------------------------------------------------------------- Despesas

export async function createExpense(db: DB, actor: Actor, raw: unknown): Promise<Created> {
  const input = expenseCreateSchema.parse(raw);
  try {
    return await db.transaction(async (tx) => {
      if (input.clientRef) {
        const [dup] = await tx.select({ id: expenses.id }).from(expenses).where(eq(expenses.clientRef, input.clientRef));
        if (dup) return { id: dup.id, duplicate: true };
      }
      assertDecision(canCreateFinancial(actor, input.date, await getLockedUntil(tx)));
      const payer = await requireActiveUser(tx, input.paidByUserId, "Pagador");
      await requireCategory(tx, input.categoryId, "despesa");
      const values = {
        clientRef: input.clientRef ?? null,
        date: input.date,
        amountCents: input.amountCents,
        categoryId: input.categoryId,
        description: input.description ?? null,
        paidByUserId: payer.id,
        party: payer.party,
        animalId: await resolveAnimalTag(tx, input.animalTag),
        lotId: await requireLot(tx, input.lotId),
        receiptId: await saveAttachment(tx, input.receipt, actor.id),
        createdBy: actor.id,
      };
      const [row] = await tx.insert(expenses).values(values).returning();
      await audit(tx, actor.id, "expense", row.id, "create", null, row);
      return { id: row.id, duplicate: false };
    });
  } catch (e) {
    if (input.clientRef && isUniqueViolation(e, "client_ref")) {
      const [dup] = await db.select({ id: expenses.id }).from(expenses).where(eq(expenses.clientRef, input.clientRef));
      if (dup) return { id: dup.id, duplicate: true };
    }
    throw e;
  }
}

export async function updateExpense(db: DB, actor: Actor, id: number, raw: unknown) {
  const input = expenseUpdateSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(expenses).where(eq(expenses.id, id)).for("update");
    if (!before) throw new NotFoundError("Despesa não encontrada");
    assertDecision(canModifyFinancial(actor, before, await getLockedUntil(tx), input.date));
    const patch: Partial<typeof expenses.$inferInsert> = { updatedAt: new Date() };
    if (input.date) patch.date = input.date;
    if (input.amountCents) patch.amountCents = input.amountCents;
    if (input.categoryId) patch.categoryId = (await requireCategory(tx, input.categoryId, "despesa")).id;
    if (input.description !== undefined) patch.description = input.description;
    if (input.paidByUserId) {
      const payer = await requireActiveUser(tx, input.paidByUserId, "Pagador");
      patch.paidByUserId = payer.id;
      patch.party = payer.party;
    }
    if (input.animalTag !== undefined) patch.animalId = await resolveAnimalTag(tx, input.animalTag);
    if (input.lotId !== undefined) patch.lotId = await requireLot(tx, input.lotId);
    if (input.receipt) patch.receiptId = await saveAttachment(tx, input.receipt, actor.id);
    else if (input.removeReceipt) patch.receiptId = null;
    const [after] = await tx.update(expenses).set(patch).where(eq(expenses.id, id)).returning();
    await audit(tx, actor.id, "expense", id, "update", before, after);
    return after;
  });
}

export async function deleteExpense(db: DB, actor: Actor, id: number) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(expenses).where(eq(expenses.id, id)).for("update");
    if (!before) throw new NotFoundError("Despesa não encontrada");
    assertDecision(canModifyFinancial(actor, before, await getLockedUntil(tx)));
    const [after] = await tx.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, id)).returning();
    await audit(tx, actor.id, "expense", id, "delete", before, after);
  });
}

// ---------------------------------------------------------------- Receitas

export async function createRevenue(db: DB, actor: Actor, raw: unknown): Promise<Created> {
  const input = revenueCreateSchema.parse(raw);
  try {
    return await db.transaction(async (tx) => {
      if (input.clientRef) {
        const [dup] = await tx.select({ id: revenues.id }).from(revenues).where(eq(revenues.clientRef, input.clientRef));
        if (dup) return { id: dup.id, duplicate: true };
      }
      const id = await insertRevenue(tx, actor, input);
      return { id, duplicate: false };
    });
  } catch (e) {
    if (input.clientRef && isUniqueViolation(e, "client_ref")) {
      const [dup] = await db.select({ id: revenues.id }).from(revenues).where(eq(revenues.clientRef, input.clientRef));
      if (dup) return { id: dup.id, duplicate: true };
    }
    throw e;
  }
}

/** Inserção de receita dentro de uma transação existente (usada também pela venda de animais). */
export async function insertRevenue(
  tx: Exec,
  actor: Actor,
  input: {
    clientRef?: string | null;
    date: string;
    amountCents: number;
    categoryId: number;
    description?: string | null;
    receivedByUserId: number;
    lotId?: number | null;
    receipt?: { mime: string; base64: string } | null;
  },
) {
  assertDecision(canCreateFinancial(actor, input.date, await getLockedUntil(tx)));
  const receiver = await requireActiveUser(tx, input.receivedByUserId, "Recebedor");
  await requireCategory(tx, input.categoryId, "receita");
  const [row] = await tx
    .insert(revenues)
    .values({
      clientRef: input.clientRef ?? null,
      date: input.date,
      amountCents: input.amountCents,
      categoryId: input.categoryId,
      description: input.description ?? null,
      receivedByUserId: receiver.id,
      party: receiver.party,
      lotId: await requireLot(tx, input.lotId),
      receiptId: await saveAttachment(tx, input.receipt, actor.id),
      createdBy: actor.id,
    })
    .returning();
  await audit(tx, actor.id, "revenue", row.id, "create", null, row);
  return row.id;
}

export async function updateRevenue(db: DB, actor: Actor, id: number, raw: unknown) {
  const input = revenueUpdateSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(revenues).where(eq(revenues.id, id)).for("update");
    if (!before) throw new NotFoundError("Receita não encontrada");
    assertDecision(canModifyFinancial(actor, before, await getLockedUntil(tx), input.date));
    const patch: Partial<typeof revenues.$inferInsert> = { updatedAt: new Date() };
    if (input.date) patch.date = input.date;
    if (input.amountCents) patch.amountCents = input.amountCents;
    if (input.categoryId) patch.categoryId = (await requireCategory(tx, input.categoryId, "receita")).id;
    if (input.description !== undefined) patch.description = input.description;
    if (input.receivedByUserId) {
      const r = await requireActiveUser(tx, input.receivedByUserId, "Recebedor");
      patch.receivedByUserId = r.id;
      patch.party = r.party;
    }
    if (input.lotId !== undefined) patch.lotId = await requireLot(tx, input.lotId);
    if (input.receipt) patch.receiptId = await saveAttachment(tx, input.receipt, actor.id);
    else if (input.removeReceipt) patch.receiptId = null;
    const [after] = await tx.update(revenues).set(patch).where(eq(revenues.id, id)).returning();
    await audit(tx, actor.id, "revenue", id, "update", before, after);
    return after;
  });
}

export async function deleteRevenue(db: DB, actor: Actor, id: number) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(revenues).where(eq(revenues.id, id)).for("update");
    if (!before) throw new NotFoundError("Receita não encontrada");
    assertDecision(canModifyFinancial(actor, before, await getLockedUntil(tx)));
    const [after] = await tx.update(revenues).set({ deletedAt: new Date() }).where(eq(revenues.id, id)).returning();
    await audit(tx, actor.id, "revenue", id, "delete", before, after);
  });
}

// ---------------------------------------------------------------- Reembolsos

export async function createReimbursement(db: DB, actor: Actor, raw: unknown): Promise<Created> {
  const input = reimbursementCreateSchema.parse(raw);
  try {
    return await db.transaction(async (tx) => {
      if (input.clientRef) {
        const [dup] = await tx
          .select({ id: reimbursements.id })
          .from(reimbursements)
          .where(eq(reimbursements.clientRef, input.clientRef));
        if (dup) return { id: dup.id, duplicate: true };
      }
      assertDecision(canCreateFinancial(actor, input.date, await getLockedUntil(tx)));
      const payer = await requireActiveUser(tx, input.paidByUserId, "Pagador");
      if (payer.party !== input.fromParty)
        throw new AppError(`${payer.name} pertence à Parte ${payer.party}, não à Parte ${input.fromParty}`);
      const [row] = await tx
        .insert(reimbursements)
        .values({
          clientRef: input.clientRef ?? null,
          date: input.date,
          amountCents: input.amountCents,
          fromParty: input.fromParty,
          paidByUserId: payer.id,
          method: input.method,
          notes: input.notes ?? null,
          createdBy: actor.id,
        })
        .returning();
      await audit(tx, actor.id, "reimbursement", row.id, "create", null, row);
      return { id: row.id, duplicate: false };
    });
  } catch (e) {
    if (input.clientRef && isUniqueViolation(e, "client_ref")) {
      const [dup] = await db
        .select({ id: reimbursements.id })
        .from(reimbursements)
        .where(eq(reimbursements.clientRef, input.clientRef));
      if (dup) return { id: dup.id, duplicate: true };
    }
    throw e;
  }
}

export async function updateReimbursement(db: DB, actor: Actor, id: number, raw: unknown) {
  const input = reimbursementUpdateSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(reimbursements).where(eq(reimbursements.id, id)).for("update");
    if (!before) throw new NotFoundError("Reembolso não encontrado");
    assertDecision(canModifyFinancial(actor, before, await getLockedUntil(tx), input.date));
    const patch: Partial<typeof reimbursements.$inferInsert> = { updatedAt: new Date() };
    if (input.date) patch.date = input.date;
    if (input.amountCents) patch.amountCents = input.amountCents;
    if (input.method) patch.method = input.method;
    if (input.notes !== undefined) patch.notes = input.notes;
    const fromParty = input.fromParty ?? before.fromParty;
    const payerId = input.paidByUserId ?? before.paidByUserId;
    const payer = await requireActiveUser(tx, payerId, "Pagador");
    if (payer.party !== fromParty) throw new AppError(`${payer.name} pertence à Parte ${payer.party}`);
    patch.fromParty = fromParty;
    patch.paidByUserId = payer.id;
    const [after] = await tx.update(reimbursements).set(patch).where(eq(reimbursements.id, id)).returning();
    await audit(tx, actor.id, "reimbursement", id, "update", before, after);
    return after;
  });
}

export async function deleteReimbursement(db: DB, actor: Actor, id: number) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(reimbursements).where(eq(reimbursements.id, id)).for("update");
    if (!before) throw new NotFoundError("Reembolso não encontrado");
    assertDecision(canModifyFinancial(actor, before, await getLockedUntil(tx)));
    const [after] = await tx
      .update(reimbursements)
      .set({ deletedAt: new Date() })
      .where(eq(reimbursements.id, id))
      .returning();
    await audit(tx, actor.id, "reimbursement", id, "delete", before, after);
  });
}

// ---------------------------------------------------------------- Consultas

export interface FinanceFilter {
  start?: string | null;
  end?: string | null;
  party?: Party | null;
  lotId?: number | null;
  categoryId?: number | null;
}

function dateConds(col: typeof expenses.date | typeof revenues.date | typeof reimbursements.date, f: FinanceFilter) {
  const c: SQL[] = [];
  if (f.start) c.push(gte(col, f.start));
  if (f.end) c.push(lte(col, f.end));
  return c;
}

export async function listExpenses(db: Exec, f: FinanceFilter = {}) {
  const conds: SQL[] = [isNull(expenses.deletedAt), ...dateConds(expenses.date, f)];
  if (f.party) conds.push(eq(expenses.party, f.party));
  if (f.categoryId) conds.push(eq(expenses.categoryId, f.categoryId));
  if (f.lotId) conds.push(sql`(${expenses.lotId} = ${f.lotId} or ${animals.lotId} = ${f.lotId})`);
  return db
    .select({
      id: expenses.id,
      date: expenses.date,
      amountCents: expenses.amountCents,
      categoryId: expenses.categoryId,
      categoryName: categories.name,
      description: expenses.description,
      paidByUserId: expenses.paidByUserId,
      paidByName: users.name,
      party: expenses.party,
      animalId: expenses.animalId,
      animalTag: animals.tag,
      lotId: expenses.lotId,
      lotName: lots.name,
      receiptId: expenses.receiptId,
      createdBy: expenses.createdBy,
      createdAt: expenses.createdAt,
    })
    .from(expenses)
    .innerJoin(categories, eq(categories.id, expenses.categoryId))
    .innerJoin(users, eq(users.id, expenses.paidByUserId))
    .leftJoin(animals, eq(animals.id, expenses.animalId))
    .leftJoin(lots, eq(lots.id, expenses.lotId))
    .where(and(...conds))
    .orderBy(desc(expenses.date), desc(expenses.id));
}

export async function listRevenues(db: Exec, f: FinanceFilter = {}) {
  const conds: SQL[] = [isNull(revenues.deletedAt), ...dateConds(revenues.date, f)];
  if (f.party) conds.push(eq(revenues.party, f.party));
  if (f.categoryId) conds.push(eq(revenues.categoryId, f.categoryId));
  if (f.lotId) conds.push(eq(revenues.lotId, f.lotId));
  return db
    .select({
      id: revenues.id,
      date: revenues.date,
      amountCents: revenues.amountCents,
      categoryId: revenues.categoryId,
      categoryName: categories.name,
      description: revenues.description,
      receivedByUserId: revenues.receivedByUserId,
      receivedByName: users.name,
      party: revenues.party,
      lotId: revenues.lotId,
      lotName: lots.name,
      receiptId: revenues.receiptId,
      createdBy: revenues.createdBy,
      createdAt: revenues.createdAt,
    })
    .from(revenues)
    .innerJoin(categories, eq(categories.id, revenues.categoryId))
    .innerJoin(users, eq(users.id, revenues.receivedByUserId))
    .leftJoin(lots, eq(lots.id, revenues.lotId))
    .where(and(...conds))
    .orderBy(desc(revenues.date), desc(revenues.id));
}

export async function listReimbursements(db: Exec, f: FinanceFilter = {}) {
  const conds: SQL[] = [isNull(reimbursements.deletedAt), ...dateConds(reimbursements.date, f)];
  if (f.party) conds.push(eq(reimbursements.fromParty, f.party));
  return db
    .select({
      id: reimbursements.id,
      date: reimbursements.date,
      amountCents: reimbursements.amountCents,
      fromParty: reimbursements.fromParty,
      paidByUserId: reimbursements.paidByUserId,
      paidByName: users.name,
      method: reimbursements.method,
      notes: reimbursements.notes,
      createdBy: reimbursements.createdBy,
      createdAt: reimbursements.createdAt,
    })
    .from(reimbursements)
    .innerJoin(users, eq(users.id, reimbursements.paidByUserId))
    .where(and(...conds))
    .orderBy(desc(reimbursements.date), desc(reimbursements.id));
}

/** Todos os lançamentos (não excluídos) no formato do domínio do extrato. */
export async function ledgerInputs(db: Exec, until?: string | null): Promise<LedgerInput[]> {
  const f = { end: until ?? null };
  const [ex, rv, rb] = await Promise.all([listExpenses(db, f), listRevenues(db, f), listReimbursements(db, f)]);
  return [
    ...ex.map((e) => ({
      kind: "despesa" as const,
      id: e.id,
      date: e.date,
      amountCents: e.amountCents,
      party: e.party,
      description: e.description,
      userName: e.paidByName,
      categoryName: e.categoryName,
      createdAt: e.createdAt,
    })),
    ...rv.map((r) => ({
      kind: "receita" as const,
      id: r.id,
      date: r.date,
      amountCents: r.amountCents,
      party: r.party,
      description: r.description,
      userName: r.receivedByName,
      categoryName: r.categoryName,
      createdAt: r.createdAt,
    })),
    ...rb.map((r) => ({
      kind: "reembolso" as const,
      id: r.id,
      date: r.date,
      amountCents: r.amountCents,
      party: r.fromParty,
      description: r.notes ? `${r.method} — ${r.notes}` : r.method,
      userName: r.paidByName,
      categoryName: "Reembolso",
      createdAt: r.createdAt,
    })),
  ];
}

export async function getLedger(db: Exec, until?: string | null) {
  const [inputs, shares] = await Promise.all([ledgerInputs(db, until), getShares(db)]);
  return buildLedger(inputs, shares);
}

/** Saldo (B deve a A, em centavos) até a data informada (inclusive). */
export async function computeBalance(db: Exec, until?: string | null): Promise<number> {
  const lines = await getLedger(db, until);
  return lines.length ? lines[lines.length - 1].balance : 0;
}

export async function financeSummary(db: Exec, f: FinanceFilter) {
  const [inputs, shares] = await Promise.all([ledgerInputs(db), getShares(db)]);
  const inRange = inputs.filter((e) => (!f.start || e.date >= f.start) && (!f.end || e.date <= f.end));
  return partyTotals(inRange, shares);
}

export async function activeUsers(db: Exec) {
  return db
    .select({ id: users.id, name: users.name, party: users.party, role: users.role })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.party), asc(users.name));
}

export async function activeCategories(db: Exec, kind: "despesa" | "receita") {
  return db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(and(eq(categories.kind, kind), eq(categories.active, true)))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

export async function getExpense(db: Exec, id: number) {
  const [e] = await db
    .select({ e: expenses, animalTag: animals.tag })
    .from(expenses)
    .leftJoin(animals, eq(animals.id, expenses.animalId))
    .where(eq(expenses.id, id));
  return e ? { ...e.e, animalTag: e.animalTag } : null;
}

export async function getRevenue(db: Exec, id: number) {
  const [r] = await db.select().from(revenues).where(eq(revenues.id, id));
  return r ?? null;
}

export async function getReimbursement(db: Exec, id: number) {
  const [r] = await db.select().from(reimbursements).where(eq(reimbursements.id, id));
  return r ?? null;
}
