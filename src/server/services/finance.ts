import { and, asc, desc, eq, gte, isNull, lte, sql, type SQL } from "drizzle-orm";
import { alias as aliasTable } from "drizzle-orm/pg-core";
import type { DB, Exec } from "@/db";
import { animals, categories, expenses, lots, reimbursements, revenues, shareConfigs, users } from "@/db/schema";
import { buildLedger, partyTotals, type LedgerInput, type Party, type Share } from "@/domain/ledger";
import { assertDecision, canCreateFinancial, canModifyFinancial, type Actor } from "@/domain/policy";
import {
  expenseCreateSchema,
  expenseUpdateSchema,
  payExpenseSchema,
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
      await requireCategory(tx, input.categoryId, "despesa");
      const animalId = await resolveAnimalTag(tx, input.animalTag);
      const lotId = await requireLot(tx, input.lotId);
      const common = {
        categoryId: input.categoryId,
        description: input.description ?? null,
        species: input.species ?? "ambos",
        animalId,
        lotId,
        createdBy: actor.id,
      };

      // Compra parcelada: entrada(s) opcional(is), cada uma paga por uma parte, + N parcelas.
      const installments = input.installments ?? [];
      if (installments.length > 0) {
        const downs =
          input.downPayments && input.downPayments.length > 0
            ? input.downPayments
            : input.paidNowCents != null && input.paidNowCents > 0
              ? [{ paidByUserId: input.paidByUserId!, amountCents: input.paidNowCents }]
              : [];
        let anchorId: number | null = null;
        for (const [idx, d] of downs.entries()) {
          const payer = await requireActiveUser(tx, d.paidByUserId, "Pagador");
          const [entrada] = await tx
            .insert(expenses)
            .values({
              ...common,
              // recibo/clientRef vão na 1ª entrada (âncora de idempotência)
              clientRef: idx === 0 ? input.clientRef ?? null : null,
              date: input.date,
              amountCents: d.amountCents,
              status: "pago",
              paidByUserId: payer.id,
              party: payer.party,
              receiptId: idx === 0 ? await saveAttachment(tx, input.receipt, actor.id) : null,
            })
            .returning();
          await audit(tx, actor.id, "expense", entrada.id, "create", null, entrada);
          if (idx === 0) anchorId = entrada.id;
        }
        let firstId: number | null = null;
        for (const [idx, p] of installments.entries()) {
          // Sem entrada, a 1ª parcela carrega o clientRef/recibo (âncora de idempotência).
          const anchorRow = anchorId == null && idx === 0;
          const [parcela] = await tx
            .insert(expenses)
            .values({
              ...common,
              clientRef: anchorRow ? input.clientRef ?? null : null,
              date: input.date,
              amountCents: p.amountCents,
              status: "a_pagar",
              dueDate: p.dueDate,
              paidByUserId: null,
              party: null,
              parentExpenseId: anchorId,
              receiptId: anchorRow ? await saveAttachment(tx, input.receipt, actor.id) : null,
            })
            .returning();
          await audit(tx, actor.id, "expense", parcela.id, "create", null, parcela);
          if (idx === 0) firstId = parcela.id;
        }
        return { id: anchorId ?? firstId!, duplicate: false };
      }

      const payable = input.status === "a_pagar";
      // Pagamento parcial (1 parcela): parte paga agora + saldo que vira conta a pagar.
      const splitting = !payable && input.paidNowCents != null && input.paidNowCents < input.amountCents;
      // Conta a pagar: pagador/parte só são definidos quando ela for paga.
      const payer = payable ? null : await requireActiveUser(tx, input.paidByUserId!, "Pagador");
      const receiptId = await saveAttachment(tx, input.receipt, actor.id);
      const [row] = await tx
        .insert(expenses)
        .values({
          ...common,
          clientRef: input.clientRef ?? null,
          date: input.date,
          amountCents: splitting ? input.paidNowCents! : input.amountCents,
          status: input.status,
          dueDate: payable ? input.dueDate ?? null : null,
          paidByUserId: payer?.id ?? null,
          party: payer?.party ?? null,
          receiptId,
        })
        .returning();
      await audit(tx, actor.id, "expense", row.id, "create", null, row);
      if (splitting) {
        // Saldo a pagar: conta em aberto (sem parte A/B) vinculada à parcela paga.
        const [rest] = await tx
          .insert(expenses)
          .values({
            ...common,
            date: input.date,
            amountCents: input.amountCents - input.paidNowCents!,
            status: "a_pagar",
            dueDate: input.dueDate ?? null,
            paidByUserId: null,
            party: null,
            parentExpenseId: row.id,
          })
          .returning();
        await audit(tx, actor.id, "expense", rest.id, "create", null, rest);
      }
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
    const finalStatus = input.status ?? before.status;
    if (input.status) patch.status = input.status;
    if (input.dueDate !== undefined) patch.dueDate = input.dueDate;
    if (input.paidByUserId) {
      const payer = await requireActiveUser(tx, input.paidByUserId, "Pagador");
      patch.paidByUserId = payer.id;
      patch.party = payer.party;
    }
    if (finalStatus === "a_pagar") {
      // conta a pagar não tem pagador nem parte até ser paga
      patch.paidByUserId = null;
      patch.party = null;
      if ((input.dueDate ?? before.dueDate) == null) throw new AppError("Informe o vencimento da conta a pagar");
    } else if (finalStatus === "pago") {
      patch.dueDate = null;
      if (!(patch.paidByUserId ?? before.paidByUserId)) throw new AppError("Informe quem pagou");
    }
    if (input.species) patch.species = input.species;
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

/**
 * Marca uma conta a pagar como paga: registra quem pagou e quando, derivando a parte.
 * A partir daí a despesa passa a contar no acerto entre as partes.
 * Qualquer sócio pode pagar (não é um lançamento "de outro" — a conta é comum).
 */
export async function payExpense(db: DB, actor: Actor, id: number, raw: unknown) {
  const input = payExpenseSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(expenses).where(eq(expenses.id, id)).for("update");
    if (!before) throw new NotFoundError("Conta não encontrada");
    if (before.deletedAt) throw new AppError("Conta já excluída");
    if (before.status === "pago") throw new AppError("Esta conta já está paga");
    assertDecision(canCreateFinancial(actor, input.date, await getLockedUntil(tx)));
    const payer = await requireActiveUser(tx, input.paidByUserId, "Pagador");
    const [after] = await tx
      .update(expenses)
      .set({ status: "pago", dueDate: null, date: input.date, paidByUserId: payer.id, party: payer.party, updatedAt: new Date() })
      .where(eq(expenses.id, id))
      .returning();
    await audit(tx, actor.id, "expense", id, "update", before, after);
    return after;
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
    species?: "ovino" | "bovino" | "ambos";
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
      species: input.species ?? "ambos",
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
    if (input.species) patch.species = input.species;
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
  /** Visão por espécie: inclui lançamentos da espécie E os marcados "ambos" (geral). */
  species?: "ovino" | "bovino" | null;
  /** Filtro exato de espécie (ovino, bovino ou ambos), sem incluir "ambos" junto. */
  speciesExact?: "ovino" | "bovino" | "ambos" | null;
  /** Situação da despesa: 'pago' (realizada) ou 'a_pagar' (pendente). */
  status?: "pago" | "a_pagar" | null;
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
  if (f.species) conds.push(sql`(${expenses.species} = ${f.species} or ${expenses.species} = 'ambos')`);
  if (f.speciesExact) conds.push(eq(expenses.species, f.speciesExact));
  if (f.status) conds.push(eq(expenses.status, f.status));
  if (f.lotId) conds.push(sql`(${expenses.lotId} = ${f.lotId} or ${animals.lotId} = ${f.lotId})`);
  return db
    .select({
      id: expenses.id,
      date: expenses.date,
      amountCents: expenses.amountCents,
      categoryId: expenses.categoryId,
      categoryName: categories.name,
      description: expenses.description,
      status: expenses.status,
      dueDate: expenses.dueDate,
      paidByUserId: expenses.paidByUserId,
      paidByName: users.name,
      party: expenses.party,
      species: expenses.species,
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
    .leftJoin(users, eq(users.id, expenses.paidByUserId))
    .leftJoin(animals, eq(animals.id, expenses.animalId))
    .leftJoin(lots, eq(lots.id, expenses.lotId))
    .where(and(...conds))
    .orderBy(desc(expenses.date), desc(expenses.id));
}

/** Contas a pagar (status 'a_pagar', não excluídas), ordenadas por vencimento. */
export async function listPayables(db: Exec, f: FinanceFilter = {}) {
  const conds: SQL[] = [isNull(expenses.deletedAt), eq(expenses.status, "a_pagar")];
  if (f.start) conds.push(gte(expenses.dueDate, f.start));
  if (f.end) conds.push(lte(expenses.dueDate, f.end));
  if (f.species) conds.push(sql`(${expenses.species} = ${f.species} or ${expenses.species} = 'ambos')`);
  if (f.categoryId) conds.push(eq(expenses.categoryId, f.categoryId));
  // Quando a conta é o saldo de um pagamento parcial, trazemos a parcela já paga (parent).
  const parent = aliasTable(expenses, "parent_expense");
  return db
    .select({
      id: expenses.id,
      date: expenses.date,
      dueDate: expenses.dueDate,
      amountCents: expenses.amountCents,
      categoryId: expenses.categoryId,
      categoryName: categories.name,
      description: expenses.description,
      species: expenses.species,
      animalTag: animals.tag,
      lotName: lots.name,
      receiptId: expenses.receiptId,
      /** Parcela já paga de um pagamento parcial (null quando é uma conta avulsa). */
      paidCents: parent.amountCents,
      paidDate: parent.date,
      createdBy: expenses.createdBy,
      createdAt: expenses.createdAt,
    })
    .from(expenses)
    .innerJoin(categories, eq(categories.id, expenses.categoryId))
    .leftJoin(animals, eq(animals.id, expenses.animalId))
    .leftJoin(lots, eq(lots.id, expenses.lotId))
    .leftJoin(parent, eq(parent.id, expenses.parentExpenseId))
    .where(and(...conds))
    .orderBy(asc(expenses.dueDate), asc(expenses.id));
}

export async function listRevenues(db: Exec, f: FinanceFilter = {}) {
  const conds: SQL[] = [isNull(revenues.deletedAt), ...dateConds(revenues.date, f)];
  if (f.party) conds.push(eq(revenues.party, f.party));
  if (f.categoryId) conds.push(eq(revenues.categoryId, f.categoryId));
  if (f.species) conds.push(sql`(${revenues.species} = ${f.species} or ${revenues.species} = 'ambos')`);
  if (f.speciesExact) conds.push(eq(revenues.species, f.speciesExact));
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
      species: revenues.species,
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
  // Contas a pagar (status 'a_pagar') NÃO entram no acerto até serem pagas.
  const [ex, rv, rb] = await Promise.all([listExpenses(db, { ...f, status: "pago" }), listRevenues(db, f), listReimbursements(db, f)]);
  return [
    ...ex.map((e) => ({
      kind: "despesa" as const,
      id: e.id,
      date: e.date,
      amountCents: e.amountCents,
      party: e.party as Party,
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
