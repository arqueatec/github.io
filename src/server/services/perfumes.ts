import Papa from "papaparse";
import { and, asc, desc, eq, gte, isNull, lte, sql, type SQL } from "drizzle-orm";
import type { DB, Exec } from "@/db";
import { perfumeMovements, perfumes, users } from "@/db/schema";
import { assert, type Actor } from "@/domain/policy";
import { parseMoneyToCents } from "@/domain/money";
import { perfumeAdjustSchema, perfumeCreateSchema, perfumeRestockSchema, perfumeSaleSchema, perfumeUpdateSchema } from "@/lib/schemas";
import { AppError, ConflictError, NotFoundError, isUniqueViolation } from "../errors";
import { audit } from "./audit";

const DEFAULT_COST = 1300;
const DEFAULT_PRICE = 3000;
export const LOW_STOCK = 3;

type Created = { id: number; duplicate: boolean };

// ---------------------------------------------------------------- Catálogo / estoque

export async function listPerfumes(db: Exec, onlyActive = false) {
  const rows = await db.select().from(perfumes).orderBy(asc(perfumes.name));
  const list = onlyActive ? rows.filter((p) => p.active) : rows;
  return list.map((p) => ({ ...p, valueCents: p.stock * p.costCents }));
}

export async function getPerfume(db: Exec, id: number) {
  const [p] = await db.select().from(perfumes).where(eq(perfumes.id, id));
  return p ?? null;
}

/** Usuários do módulo de perfumes (para o campo "quem vendeu"). */
export async function perfumeSellers(db: Exec) {
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.active, true), eq(users.area, "perfumes")))
    .orderBy(asc(users.name));
}

export async function createPerfume(db: DB, actor: Actor, raw: unknown) {
  assert(actor.active);
  const input = perfumeCreateSchema.parse(raw);
  try {
    const [row] = await db
      .insert(perfumes)
      .values({
        name: input.name,
        costCents: input.costCents ?? DEFAULT_COST,
        priceCents: input.priceCents ?? DEFAULT_PRICE,
        stock: input.stock ?? 0,
        active: input.active ?? true,
        createdBy: actor.id,
      })
      .returning();
    await audit(db, actor.id, "perfume", row.id, "create", null, row);
    return row;
  } catch (e) {
    if (isUniqueViolation(e)) throw new ConflictError("Já existe um perfume com esse nome");
    throw e;
  }
}

export async function updatePerfume(db: DB, actor: Actor, id: number, raw: unknown) {
  assert(actor.active);
  const input = perfumeUpdateSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(perfumes).where(eq(perfumes.id, id)).for("update");
    if (!before) throw new NotFoundError("Perfume não encontrado");
    const patch: Partial<typeof perfumes.$inferInsert> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.costCents != null) patch.costCents = input.costCents;
    if (input.priceCents != null) patch.priceCents = input.priceCents;
    if (input.active !== undefined) patch.active = input.active;
    try {
      const [after] = await tx.update(perfumes).set(patch).where(eq(perfumes.id, id)).returning();
      await audit(tx, actor.id, "perfume", id, "update", before, after);
      return after;
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictError("Já existe um perfume com esse nome");
      throw e;
    }
  });
}

// ---------------------------------------------------------------- Movimentos (venda / compra / ajuste)

async function dupMovement(db: Exec, clientRef: string) {
  const [dup] = await db.select({ id: perfumeMovements.id }).from(perfumeMovements).where(eq(perfumeMovements.clientRef, clientRef));
  return dup ?? null;
}

/** Venda: baixa o estoque e entra no caixa (receita). */
export async function sellPerfume(db: DB, actor: Actor, raw: unknown): Promise<Created> {
  assert(actor.active);
  const input = perfumeSaleSchema.parse(raw);
  try {
    return await db.transaction(async (tx) => {
      if (input.clientRef) {
        const dup = await dupMovement(tx, input.clientRef);
        if (dup) return { id: dup.id, duplicate: true };
      }
      const [p] = await tx.select().from(perfumes).where(eq(perfumes.id, input.perfumeId)).for("update");
      if (!p) throw new NotFoundError("Perfume não encontrado");
      if (p.stock < input.qty) throw new AppError(`Estoque insuficiente: há ${p.stock} em estoque de ${p.name}`);
      await tx.update(perfumes).set({ stock: p.stock - input.qty, updatedAt: new Date() }).where(eq(perfumes.id, p.id));
      const [mov] = await tx
        .insert(perfumeMovements)
        .values({
          clientRef: input.clientRef ?? null,
          perfumeId: p.id,
          kind: "venda",
          qty: input.qty,
          unitCents: input.unitCents,
          unitCostCents: p.costCents,
          totalCents: input.qty * input.unitCents,
          date: input.date,
          soldByUserId: input.soldByUserId ?? null,
          notes: input.notes ?? null,
          createdBy: actor.id,
        })
        .returning();
      await audit(tx, actor.id, "perfume_movement", mov.id, "create", null, mov);
      return { id: mov.id, duplicate: false };
    });
  } catch (e) {
    if (input.clientRef && isUniqueViolation(e, "client_ref")) {
      const dup = await dupMovement(db, input.clientRef);
      if (dup) return { id: dup.id, duplicate: true };
    }
    throw e;
  }
}

/** Compra/reposição: entra no estoque e sai do caixa. */
export async function restockPerfume(db: DB, actor: Actor, raw: unknown): Promise<Created> {
  assert(actor.active);
  const input = perfumeRestockSchema.parse(raw);
  try {
    return await db.transaction(async (tx) => {
      if (input.clientRef) {
        const dup = await dupMovement(tx, input.clientRef);
        if (dup) return { id: dup.id, duplicate: true };
      }
      const [p] = await tx.select().from(perfumes).where(eq(perfumes.id, input.perfumeId)).for("update");
      if (!p) throw new NotFoundError("Perfume não encontrado");
      await tx.update(perfumes).set({ stock: p.stock + input.qty, updatedAt: new Date() }).where(eq(perfumes.id, p.id));
      const [mov] = await tx
        .insert(perfumeMovements)
        .values({
          clientRef: input.clientRef ?? null,
          perfumeId: p.id,
          kind: "compra",
          qty: input.qty,
          unitCents: input.unitCents,
          unitCostCents: input.unitCents,
          totalCents: input.qty * input.unitCents,
          date: input.date,
          notes: input.notes ?? null,
          createdBy: actor.id,
        })
        .returning();
      await audit(tx, actor.id, "perfume_movement", mov.id, "create", null, mov);
      return { id: mov.id, duplicate: false };
    });
  } catch (e) {
    if (input.clientRef && isUniqueViolation(e, "client_ref")) {
      const dup = await dupMovement(db, input.clientRef);
      if (dup) return { id: dup.id, duplicate: true };
    }
    throw e;
  }
}

/** Ajuste de estoque (recontagem): define o novo saldo sem efeito no caixa. */
export async function adjustPerfume(db: DB, actor: Actor, raw: unknown) {
  assert(actor.active);
  const input = perfumeAdjustSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(perfumes).where(eq(perfumes.id, input.perfumeId)).for("update");
    if (!p) throw new NotFoundError("Perfume não encontrado");
    const delta = input.stock - p.stock;
    if (delta === 0) return { id: p.id, delta: 0 };
    await tx.update(perfumes).set({ stock: input.stock, updatedAt: new Date() }).where(eq(perfumes.id, p.id));
    const [mov] = await tx
      .insert(perfumeMovements)
      .values({
        perfumeId: p.id,
        kind: "ajuste",
        qty: delta,
        unitCents: 0,
        totalCents: 0,
        date: input.date,
        notes: input.notes ?? null,
        createdBy: actor.id,
      })
      .returning();
    await audit(tx, actor.id, "perfume_movement", mov.id, "create", null, mov);
    return { id: mov.id, delta };
  });
}

/** Estorna um movimento (exclusão lógica) e desfaz o efeito no estoque. */
export async function deletePerfumeMovement(db: DB, actor: Actor, id: number) {
  assert(actor.active);
  return db.transaction(async (tx) => {
    const [mov] = await tx.select().from(perfumeMovements).where(eq(perfumeMovements.id, id)).for("update");
    if (!mov) throw new NotFoundError("Movimento não encontrado");
    if (mov.deletedAt) throw new AppError("Movimento já estornado");
    const [p] = await tx.select().from(perfumes).where(eq(perfumes.id, mov.perfumeId)).for("update");
    if (p) {
      // venda devolve ao estoque; compra/ajuste são revertidos
      const newStock = mov.kind === "venda" ? p.stock + mov.qty : p.stock - mov.qty;
      if (newStock < 0) throw new AppError("Não é possível estornar: o estoque resultante ficaria negativo");
      await tx.update(perfumes).set({ stock: newStock, updatedAt: new Date() }).where(eq(perfumes.id, p.id));
    }
    const [after] = await tx.update(perfumeMovements).set({ deletedAt: new Date() }).where(eq(perfumeMovements.id, id)).returning();
    await audit(tx, actor.id, "perfume_movement", id, "delete", mov, after);
    return after;
  });
}

// ---------------------------------------------------------------- Consultas / caixa

export interface PerfumeFilter {
  start?: string | null;
  end?: string | null;
  kind?: "venda" | "compra" | "ajuste" | null;
}

function movConds(f: PerfumeFilter): SQL[] {
  const c: SQL[] = [isNull(perfumeMovements.deletedAt)];
  if (f.start) c.push(gte(perfumeMovements.date, f.start));
  if (f.end) c.push(lte(perfumeMovements.date, f.end));
  if (f.kind) c.push(eq(perfumeMovements.kind, f.kind));
  return c;
}

export async function listPerfumeMovements(db: Exec, f: PerfumeFilter = {}) {
  return db
    .select({
      id: perfumeMovements.id,
      perfumeId: perfumeMovements.perfumeId,
      perfumeName: perfumes.name,
      kind: perfumeMovements.kind,
      qty: perfumeMovements.qty,
      unitCents: perfumeMovements.unitCents,
      unitCostCents: perfumeMovements.unitCostCents,
      totalCents: perfumeMovements.totalCents,
      date: perfumeMovements.date,
      soldByName: users.name,
      notes: perfumeMovements.notes,
      createdAt: perfumeMovements.createdAt,
    })
    .from(perfumeMovements)
    .innerJoin(perfumes, eq(perfumes.id, perfumeMovements.perfumeId))
    .leftJoin(users, eq(users.id, perfumeMovements.soldByUserId))
    .where(and(...movConds(f)))
    .orderBy(desc(perfumeMovements.date), desc(perfumeMovements.id));
}

/** Resumo do caixa no período: receita, custo das vendas, lucro, compras e saldo. */
export async function perfumeCashSummary(db: Exec, f: PerfumeFilter = {}) {
  const [row] = await db
    .select({
      receita: sql<number>`coalesce(sum(case when ${perfumeMovements.kind} = 'venda' then ${perfumeMovements.totalCents} else 0 end), 0)::int`,
      custoVendas: sql<number>`coalesce(sum(case when ${perfumeMovements.kind} = 'venda' then ${perfumeMovements.qty} * coalesce(${perfumeMovements.unitCostCents}, 0) else 0 end), 0)::int`,
      compras: sql<number>`coalesce(sum(case when ${perfumeMovements.kind} = 'compra' then ${perfumeMovements.totalCents} else 0 end), 0)::int`,
      unidadesVendidas: sql<number>`coalesce(sum(case when ${perfumeMovements.kind} = 'venda' then ${perfumeMovements.qty} else 0 end), 0)::int`,
      vendas: sql<number>`coalesce(sum(case when ${perfumeMovements.kind} = 'venda' then 1 else 0 end), 0)::int`,
    })
    .from(perfumeMovements)
    .where(and(...movConds(f)));
  const lucro = row.receita - row.custoVendas;
  const saldoCaixa = row.receita - row.compras;
  return { ...row, lucro, saldoCaixa };
}

/** Resumo do estoque: unidades, valor a custo e a preço, e itens com estoque baixo. */
export async function perfumeStockSummary(db: Exec, lowThreshold = LOW_STOCK) {
  const rows = await listPerfumes(db, true);
  return {
    count: rows.length,
    units: rows.reduce((s, p) => s + p.stock, 0),
    valueCost: rows.reduce((s, p) => s + p.stock * p.costCents, 0),
    valuePrice: rows.reduce((s, p) => s + p.stock * p.priceCents, 0),
    low: rows.filter((p) => p.stock <= lowThreshold),
  };
}

// ---------------------------------------------------------------- Importação (CSV)

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const PERFUME_ALIASES: Record<string, string[]> = {
  name: ["nome", "perfume", "produto", "name"],
  cost: ["custo", "custocompra", "compra", "valorcompra", "precocompra"],
  price: ["preco", "venda", "precovenda", "valorvenda", "precodevenda"],
  stock: ["estoque", "quantidade", "qtd", "qtde", "saldo", "qtdestoque"],
};

export const PERFUME_IMPORT_TEMPLATE =
  "﻿nome;custo;preco;estoque\n" + "Invictus;13,00;30,00;30\n" + "Bleu de Chanel;13,00;30,00;27\n";

/** Importa/atualiza o catálogo a partir de um CSV (nome;custo;preco;estoque). */
export async function importPerfumes(db: DB, actor: Actor, buffer: Buffer) {
  assert(actor.active);
  const text = buffer.toString("utf8").replace(/^﻿/, "");
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, delimiter: "" });
  const records = parsed.data;
  if (!records.length) throw new AppError("Nenhuma linha encontrada na planilha");
  if (records.length > 2000) throw new AppError("Máximo de 2000 linhas por importação");
  const keys = Object.keys(records[0]);
  const map: Record<string, string> = {};
  for (const k of keys) {
    const n = norm(k);
    for (const [field, aliases] of Object.entries(PERFUME_ALIASES)) if (aliases.includes(n) && !map[field]) map[field] = k;
  }
  if (!map.name) throw new AppError("Coluna 'nome' não encontrada. Use o cabeçalho nome;custo;preco;estoque.");

  const items = records
    .map((r) => {
      const get = (f: string) => (map[f] ? String(r[map[f]] ?? "").trim() : "");
      const name = get("name");
      if (!name) return null;
      const cost = get("cost") ? parseMoneyToCents(get("cost")) : null;
      const price = get("price") ? parseMoneyToCents(get("price")) : null;
      const stockRaw = get("stock");
      const stock = stockRaw ? Math.trunc(Number(stockRaw.replace(/\D/g, ""))) : 0;
      return {
        name,
        costCents: cost && cost > 0 ? cost : DEFAULT_COST,
        priceCents: price && price > 0 ? price : DEFAULT_PRICE,
        stock: Number.isFinite(stock) && stock > 0 ? stock : 0,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  if (!items.length) throw new AppError("Nenhum perfume válido na planilha");

  return db.transaction(async (tx) => {
    let created = 0;
    let updated = 0;
    for (const it of items) {
      const [existing] = await tx.select().from(perfumes).where(sql`lower(${perfumes.name}) = lower(${it.name})`);
      if (existing) {
        await tx.update(perfumes).set({ costCents: it.costCents, priceCents: it.priceCents, stock: it.stock, active: true, updatedAt: new Date() }).where(eq(perfumes.id, existing.id));
        updated++;
      } else {
        await tx.insert(perfumes).values({ ...it, createdBy: actor.id });
        created++;
      }
    }
    await audit(tx, actor.id, "perfume_import", null, "create", null, { created, updated, total: items.length });
    return { created, updated, total: items.length };
  });
}
