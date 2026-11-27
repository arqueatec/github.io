/**
 * Testes de integração do módulo de perfumes (estoque + caixa) contra PostgreSQL real.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DB } from "@/db";
import { perfumeMovements } from "@/db/schema";
import {
  adjustPerfume,
  createPerfume,
  deletePerfumeMovement,
  getPerfume,
  importPerfumes,
  perfumeCashSummary,
  restockPerfume,
  sellPerfume,
} from "@/server/services/perfumes";
import { freshDb, hasDb, makeUsers } from "./helpers/db";

const d = hasDb ? describe : describe.skip;
const name = () => `Perfume ${randomUUID().slice(0, 8)}`;

d("perfumes (integração)", () => {
  let db: DB;
  let close: () => Promise<void>;
  let U: Awaited<ReturnType<typeof makeUsers>>;

  beforeAll(async () => {
    ({ db, close } = await freshDb());
    U = await makeUsers(db);
  });
  afterAll(async () => close?.());

  it("venda baixa o estoque e entra no caixa com lucro", async () => {
    const p = await createPerfume(db, U.A, { name: name(), costCents: 1300, priceCents: 3000, stock: 10 });
    await sellPerfume(db, U.A, { perfumeId: p.id, qty: 3, unitCents: 3000, date: "2030-01-01" });
    expect((await getPerfume(db, p.id))!.stock).toBe(7);
    const r = await perfumeCashSummary(db, { start: "2030-01-01", end: "2030-01-01" });
    expect(r.receita).toBe(9000);
    expect(r.custoVendas).toBe(3900); // 3 × 1300
    expect(r.lucro).toBe(5100);
    expect(r.saldoCaixa).toBe(9000);
    expect(r.unidadesVendidas).toBe(3);
  });

  it("não vende mais que o estoque", async () => {
    const p = await createPerfume(db, U.A, { name: name(), stock: 2 });
    await expect(sellPerfume(db, U.A, { perfumeId: p.id, qty: 5, unitCents: 3000, date: "2030-01-02" })).rejects.toThrow(/insuficiente/i);
    expect((await getPerfume(db, p.id))!.stock).toBe(2);
  });

  it("reposição entra no estoque e sai do caixa", async () => {
    const p = await createPerfume(db, U.A, { name: name(), stock: 0 });
    await restockPerfume(db, U.A, { perfumeId: p.id, qty: 5, unitCents: 1300, date: "2030-02-01" });
    expect((await getPerfume(db, p.id))!.stock).toBe(5);
    const r = await perfumeCashSummary(db, { start: "2030-02-01", end: "2030-02-01" });
    expect(r.compras).toBe(6500);
    expect(r.saldoCaixa).toBe(-6500);
  });

  it("estorno desfaz o efeito da venda no estoque", async () => {
    const p = await createPerfume(db, U.A, { name: name(), stock: 5 });
    const mov = await sellPerfume(db, U.A, { perfumeId: p.id, qty: 2, unitCents: 3000, date: "2030-03-01" });
    expect((await getPerfume(db, p.id))!.stock).toBe(3);
    await deletePerfumeMovement(db, U.A, mov.id);
    expect((await getPerfume(db, p.id))!.stock).toBe(5);
    const [row] = await db.select().from(perfumeMovements).where(eq(perfumeMovements.id, mov.id));
    expect(row.deletedAt).not.toBeNull();
    // estornar de novo é bloqueado
    await expect(deletePerfumeMovement(db, U.A, mov.id)).rejects.toThrow(/já estornado/i);
  });

  it("ajuste define o novo saldo (recontagem)", async () => {
    const p = await createPerfume(db, U.A, { name: name(), stock: 10 });
    await adjustPerfume(db, U.A, { perfumeId: p.id, stock: 7, date: "2030-04-01" });
    expect((await getPerfume(db, p.id))!.stock).toBe(7);
  });

  it("importa catálogo por CSV (cria e atualiza)", async () => {
    const n1 = name();
    const csv = `nome;custo;preco;estoque\n${n1};13,00;30,00;30\nMarca ${randomUUID().slice(0, 6)};10,00;25,00;5\n`;
    const r1 = await importPerfumes(db, U.A, Buffer.from(csv, "utf8"));
    expect(r1.created).toBe(2);
    // reimportar o mesmo nome atualiza (não duplica)
    const r2 = await importPerfumes(db, U.A, Buffer.from(`nome;custo;preco;estoque\n${n1};13,00;30,00;40\n`, "utf8"));
    expect(r2.updated).toBe(1);
    expect(r2.created).toBe(0);
  });
});
