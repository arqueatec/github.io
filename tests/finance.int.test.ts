/**
 * Testes de integração com PostgreSQL real (TEST_DATABASE_URL): rateio, compensação,
 * reembolsos, saldo, travas de período, auditoria e regras de acesso no servidor.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DB } from "@/db";
import { auditLog, categories, expenses } from "@/db/schema";
import { AccessError } from "@/domain/policy";
import {
  computeBalance,
  createExpense,
  createReimbursement,
  createRevenue,
  deleteExpense,
  getLedger,
  updateExpense,
} from "@/server/services/finance";
import { closePeriod, getLockedUntil, reopenPeriod } from "@/server/services/locks";
import { createShareConfig, createUser, updateUser } from "@/server/services/admin";
import { freshDb, hasDb, makeUsers } from "./helpers/db";

const d = hasDb ? describe : describe.skip;

d("finanças (integração)", () => {
  let db: DB;
  let close: () => Promise<void>;
  let U: Awaited<ReturnType<typeof makeUsers>>;
  let catDesp: number;
  let catRec: number;

  beforeAll(async () => {
    ({ db, close } = await freshDb());
    U = await makeUsers(db);
    catDesp = (await db.select().from(categories).where(eq(categories.name, "Veterinário")))[0].id;
    catRec = (await db.select().from(categories).where(eq(categories.name, "Lã")))[0].id;
  });
  afterAll(async () => close?.());

  const exp = (who: { id: number }, amountCents: number, date = "2025-01-10", payer = who.id) => ({
    date,
    amountCents,
    categoryId: catDesp,
    paidByUserId: payer,
    description: "teste",
  });

  it("deriva a parte do usuário que pagou e aplica 1/3 – 2/3", async () => {
    const r = await createExpense(db, U.A, exp(U.A, 30000));
    const [row] = await db.select().from(expenses).where(eq(expenses.id, r.id));
    expect(row.party).toBe("A");
    expect(await computeBalance(db)).toBe(20000); // B deve 200

    await createExpense(db, U.B1, exp(U.B1, 30000));
    expect(await computeBalance(db)).toBe(10000); // compensação: B deve 200 − 100 = 100
  });

  it("guarda qual irmão da Parte B pagou, sem acerto interno", async () => {
    const r = await createExpense(db, U.B2, exp(U.B2, 30000));
    const [row] = await db.select().from(expenses).where(eq(expenses.id, r.id));
    expect(row.paidByUserId).toBe(U.B2.id);
    expect(row.party).toBe("B");
    expect(await computeBalance(db)).toBe(0); // B1 e B2 são a mesma parte
  });

  it("receitas seguem a lógica inversa", async () => {
    await createRevenue(db, U.A, { date: "2025-01-11", amountCents: 30000, categoryId: catRec, receivedByUserId: U.A.id });
    expect(await computeBalance(db)).toBe(-20000); // A deve 200 a B
    await createRevenue(db, U.B1, { date: "2025-01-12", amountCents: 30000, categoryId: catRec, receivedByUserId: U.B1.id });
    expect(await computeBalance(db)).toBe(-10000); // A deve 100
  });

  it("reembolso quita o saldo e o extrato mostra o efeito de cada lançamento", async () => {
    await createReimbursement(db, U.A, { date: "2025-01-13", amountCents: 10000, fromParty: "A", paidByUserId: U.A.id, method: "pix" });
    expect(await computeBalance(db)).toBe(0);
    const ledger = await getLedger(db);
    expect(ledger.map((l) => l.effect)).toEqual([20000, -10000, -10000, -20000, 10000, 10000]);
    expect(ledger.at(-1)!.balance).toBe(0);
  });

  it("reembolso com pagador de outra parte é rejeitado", async () => {
    await expect(
      createReimbursement(db, U.A, { date: "2025-01-13", amountCents: 100, fromParty: "B", paidByUserId: U.A.id, method: "pix" }),
    ).rejects.toThrow(/pertence à Parte A/);
  });

  it("arredondamento de centavos acumulado", async () => {
    for (let i = 0; i < 3; i++) await createExpense(db, U.A, exp(U.A, 100, "2025-01-14"));
    expect(await computeBalance(db)).toBe(201);
    await createExpense(db, U.B1, exp(U.B1, 1, "2025-01-14"));
    expect(await computeBalance(db)).toBe(201); // 1/3 de R$ 0,01 arredonda para 0
    await createReimbursement(db, U.B1, { date: "2025-01-15", amountCents: 201, fromParty: "B", paidByUserId: U.B1.id, method: "dinheiro" });
    expect(await computeBalance(db)).toBe(0);
  });

  it("idempotência: reenvio offline com o mesmo client_ref não duplica", async () => {
    const ref = randomUUID();
    const a = await createExpense(db, U.B1, { ...exp(U.B1, 5000, "2025-02-01"), clientRef: ref });
    const b = await createExpense(db, U.B1, { ...exp(U.B1, 5000, "2025-02-01"), clientRef: ref });
    expect(b).toEqual({ id: a.id, duplicate: true });
    await deleteExpense(db, U.B1, a.id);
  });

  it("cada sócio só edita/exclui os próprios lançamentos (inclusive o admin)", async () => {
    const r = await createExpense(db, U.B1, exp(U.B1, 9000, "2025-02-02"));
    await expect(updateExpense(db, U.B2, r.id, { amountCents: 1 })).rejects.toBeInstanceOf(AccessError);
    await expect(deleteExpense(db, U.A, r.id)).rejects.toThrow(/Só quem criou/);
    const after = await updateExpense(db, U.B1, r.id, { amountCents: 12000, paidByUserId: U.A.id });
    expect(after.amountCents).toBe(12000);
    expect(after.party).toBe("A"); // trocou o pagador → parte rederivada
    await deleteExpense(db, U.B1, r.id);
    const [row] = await db.select().from(expenses).where(eq(expenses.id, r.id));
    expect(row.deletedAt).not.toBeNull(); // exclusão lógica preserva histórico
  });

  it("auditoria registra criação, edição e exclusão com antes/depois", async () => {
    const r = await createExpense(db, U.B2, exp(U.B2, 7000, "2025-02-03"));
    await updateExpense(db, U.B2, r.id, { description: "alterada" });
    await deleteExpense(db, U.B2, r.id);
    const logs = await db.select().from(auditLog).where(eq(auditLog.entityId, r.id));
    const mine = logs.filter((l) => l.entity === "expense");
    expect(mine.map((l) => l.action)).toEqual(["create", "update", "delete"]);
    expect((mine[1].before as { description: string }).description).toBe("teste");
    expect((mine[1].after as { description: string }).description).toBe("alterada");
  });

  it("período fechado trava lançamentos; só o admin reabre", async () => {
    const before = await createExpense(db, U.B1, exp(U.B1, 3000, "2025-03-01"));
    const lock = await closePeriod(db, U.B1, { lockedUntil: "2025-03-31", notes: "acerto" });
    expect(await getLockedUntil(db)).toBe("2025-03-31");
    expect(lock.balanceCents).toBe(await computeBalance(db, "2025-03-31"));

    await expect(createExpense(db, U.B1, exp(U.B1, 1000, "2025-03-15"))).rejects.toThrow(/Período fechado/);
    await expect(updateExpense(db, U.B1, before.id, { amountCents: 1 })).rejects.toThrow(/período fechado/);
    await expect(deleteExpense(db, U.B1, before.id)).rejects.toThrow(/período fechado/);
    // depois da data travada continua liberado
    const ok = await createExpense(db, U.B1, exp(U.B1, 1000, "2025-04-01"));
    await expect(updateExpense(db, U.B1, ok.id, { date: "2025-03-20" })).rejects.toThrow(/nova data/);

    await expect(reopenPeriod(db, U.B1, lock.id, { reason: "erro" })).rejects.toBeInstanceOf(AccessError);
    await reopenPeriod(db, U.A, lock.id, { reason: "lançamento esquecido" });
    expect(await getLockedUntil(db)).toBeNull();
    await createExpense(db, U.B1, exp(U.B1, 1000, "2025-03-15"));
  });

  it("vigência de percentuais: só admin; nova vigência muda só lançamentos futuros", async () => {
    await expect(createShareConfig(db, U.B1, { validFrom: "2025-06-01", mode: "percentual", percentA: 50 })).rejects.toBeInstanceOf(AccessError);
    const b0 = await computeBalance(db);
    await createShareConfig(db, U.A, { validFrom: "2025-06-01", mode: "fracao", num: 1, den: 2 });
    expect(await computeBalance(db)).toBe(b0); // lançamentos antigos mantêm 1/3
    await createExpense(db, U.A, exp(U.A, 30000, "2025-06-10"));
    expect(await computeBalance(db)).toBe(b0 + 15000);
  });

  it("gestão de usuários: só admin, e sempre resta um admin ativo", async () => {
    await expect(createUser(db, U.B1, { name: "X", email: "x@t.com", password: "12345678", role: "socio", party: "B" })).rejects.toBeInstanceOf(AccessError);
    await expect(updateUser(db, U.A, U.A.id, { role: "socio" })).rejects.toThrow(/ao menos um administrador/);
    const u = await createUser(db, U.A, { name: "Novo", email: "Novo@T.com", password: "12345678", role: "socio", party: "B" });
    expect(u.email).toBe("novo@t.com");
  });

  it("usuário inativo não lança", async () => {
    await updateUser(db, U.A, U.B2.id, { active: false });
    await expect(createExpense(db, { ...U.B2, active: false }, exp(U.B2, 100, "2025-08-01"))).rejects.toBeInstanceOf(AccessError);
    await expect(createExpense(db, U.B1, exp(U.B1, 100, "2025-08-01", U.B2.id))).rejects.toThrow(/Pagador inválido/);
  });
});
