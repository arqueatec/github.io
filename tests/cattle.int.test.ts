/** Integração: ciclo do gado (bovino) e separação financeira por espécie. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { animals, categories, revenues } from "@/db/schema";
import { createAnimal } from "@/server/services/animals";
import { createBreedings, createBirth, createWeanings, expectedBirths } from "@/server/services/reproduction";
import { registerSale } from "@/server/services/exits";
import { createExpense, listExpenses } from "@/server/services/finance";
import { dashboard } from "@/server/services/dashboard";
import { freshDb, hasDb, makeUsers } from "./helpers/db";

const d = hasDb ? describe : describe.skip;

d("gado (integração)", () => {
  let db: DB;
  let close: () => Promise<void>;
  let U: Awaited<ReturnType<typeof makeUsers>>;
  let catVet: number;

  beforeAll(async () => {
    ({ db, close } = await freshDb());
    U = await makeUsers(db);
    catVet = (await db.select().from(categories).where(eq(categories.name, "Veterinário")))[0].id;
  });
  afterAll(async () => close?.());

  it("cadastra vaca, touro e valida categoria × sexo", async () => {
    await createAnimal(db, U.A, { tag: "V1", species: "bovino", sex: "F", category: "vaca", ageMonths: 48, entryDate: "2025-01-01" });
    await createAnimal(db, U.A, { tag: "T1", species: "bovino", sex: "M", category: "touro", ageMonths: 36, entryDate: "2025-01-01" });
    const [v] = await db.select().from(animals).where(eq(animals.tag, "V1"));
    expect(v.species).toBe("bovino");
    await expect(createAnimal(db, U.A, { tag: "X", species: "bovino", sex: "M", category: "vaca" })).rejects.toThrow(/deve ser fêmea/);
    // categoria de ovino não vale para bovino (schema aceita o enum, mas categoriesForSex não a oferece; aqui testamos sexo)
  });

  it("parto bovino: previsão 285 d, promove a vaca e cria bezerro; desmame → novilho", async () => {
    // novilha que ainda não é vaca
    await createAnimal(db, U.A, { tag: "V2", species: "bovino", sex: "F", category: "novilho", ageMonths: 24, entryDate: "2025-01-01" });
    await createBreedings(db, U.A, { eweTags: ["V2"], ramTag: "T1", date: "2025-01-10" });
    const exp = await expectedBirths(db, "2025-10-20", 40);
    expect(exp.find((e) => e.eweTag === "V2")?.expected).toBe("2025-10-22"); // 2025-01-10 + 285
    const b = await createBirth(db, U.B1, {
      eweTag: "V2",
      date: "2025-10-22",
      bornAlive: 1,
      bornDead: 0,
      birthType: "normal",
      lambs: [{ tag: "B1", sex: "M" }],
    });
    expect(b.lambIds).toHaveLength(1);
    const [v2] = await db.select().from(animals).where(eq(animals.tag, "V2"));
    expect(v2.category).toBe("vaca"); // promovida
    const [bez] = await db.select().from(animals).where(eq(animals.tag, "B1"));
    expect(bez.species).toBe("bovino");
    expect(bez.category).toBe("bezerro");
    expect(bez.fatherId).toBe((await db.select().from(animals).where(eq(animals.tag, "T1")))[0].id); // pai presumido pela cobertura (<285+35 d)
    await createWeanings(db, U.B1, { date: "2026-05-01", items: [{ tag: "B1", weightKg: 180 }] });
    const [bez2] = await db.select().from(animals).where(eq(animals.tag, "B1"));
    expect(bez2.category).toBe("novilho");
  });

  it("venda de gado gera receita com espécie bovino", async () => {
    const sale = await registerSale(db, U.B1, {
      date: "2026-06-01",
      buyer: "Frigorífico",
      priceMode: "cabeca",
      unitPriceCents: 500000,
      items: [{ tag: "B1" }],
      createRevenue: true,
      receivedByUserId: U.B1.id,
      ignoreWithdrawal: true,
    });
    const [rev] = await db.select().from(revenues).where(eq(revenues.id, sale.revenueId!));
    expect(rev.species).toBe("bovino");
  });

  it("filtro de despesa por espécie inclui 'ambos'", async () => {
    await createExpense(db, U.A, { date: "2026-02-01", amountCents: 10000, categoryId: catVet, paidByUserId: U.A.id, species: "bovino", description: "vet gado" });
    await createExpense(db, U.A, { date: "2026-02-01", amountCents: 20000, categoryId: catVet, paidByUserId: U.A.id, species: "ovino", description: "vet ovelha" });
    await createExpense(db, U.A, { date: "2026-02-01", amountCents: 30000, categoryId: catVet, paidByUserId: U.A.id, species: "ambos", description: "sal mineral" });
    const bov = await listExpenses(db, { start: "2026-02-01", end: "2026-02-01", species: "bovino" });
    const ovi = await listExpenses(db, { start: "2026-02-01", end: "2026-02-01", species: "ovino" });
    expect(bov.reduce((s, e) => s + e.amountCents, 0)).toBe(10000 + 30000); // bovino + geral
    expect(ovi.reduce((s, e) => s + e.amountCents, 0)).toBe(20000 + 30000); // ovino + geral
  });

  it("dashboard separa efetivo e finanças por espécie", async () => {
    const dBov = await dashboard(db, { start: "2026-01-01", end: "2026-12-31", species: "bovino" });
    expect(dBov.species).toBe("bovino");
    expect(dBov.herd.current.vaca).toBeGreaterThanOrEqual(1);
    expect(dBov.herd.current.matriz).toBe(0);
    // despesas bovino do período incluem geral (sal mineral)
    expect(dBov.finance.expenseTotal).toBe(10000 + 30000);
    const dOv = await dashboard(db, { start: "2026-01-01", end: "2026-12-31", species: "ovino" });
    expect(dOv.finance.expenseTotal).toBe(20000 + 30000);
    // saldo único é o mesmo em qualquer espécie
    expect(dOv.finance.balance).toBe(dBov.finance.balance);
  });
});
