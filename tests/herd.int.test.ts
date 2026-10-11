/** Integração: rebanho, reprodução, baixas e autenticação. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { animals, revenues, sessions } from "@/db/schema";
import { createAnimal, updateAnimal } from "@/server/services/animals";
import { createBirth, createBreedings, createWeanings, expectedBirths } from "@/server/services/reproduction";
import { registerExit, registerSale, undoExit } from "@/server/services/exits";
import { createHealthEvents, getAlerts } from "@/server/services/health";
import { addCountTag, countComparison, createCount, finishCount } from "@/server/services/inventory";
import { dashboard, eweDetail } from "@/server/services/dashboard";
import { commitImport, parseHerdSheet, previewImport } from "@/server/services/importExport";
import { computeBalance } from "@/server/services/finance";
import { createSession, login, userFromToken } from "@/server/auth";
import { addDays, todayIso } from "@/domain/dates";
import { freshDb, hasDb, makeUsers } from "./helpers/db";

const d = hasDb ? describe : describe.skip;
const today = todayIso();

d("rebanho (integração)", () => {
  let db: DB;
  let close: () => Promise<void>;
  let U: Awaited<ReturnType<typeof makeUsers>>;

  beforeAll(async () => {
    ({ db, close } = await freshDb());
    U = await makeUsers(db);
  });
  afterAll(async () => close?.());

  it("inventário: bloqueia brinco duplicado (sem diferenciar maiúsculas) e aceita idade estimada", async () => {
    await createAnimal(db, U.B1, { tag: "M1", sex: "F", category: "matriz", ageMonths: 36, entryDate: "2025-01-01" });
    await expect(createAnimal(db, U.B2, { tag: "m1", sex: "F", category: "matriz" })).rejects.toThrow(/já cadastrado/);
    const [a] = await db.select().from(animals).where(eq(animals.tag, "M1"));
    expect(a.birthDateEstimated).toBe(true);
    expect(a.birthDate).toBe(addDays("2025-01-01", -Math.round(36 * 30.4375)));
    await expect(createAnimal(db, U.B1, { tag: "X", sex: "M", category: "matriz" })).rejects.toThrow(/Matriz deve ser fêmea/);
  });

  it("parto cria as crias com genealogia; desmame promove a borrego", async () => {
    await createAnimal(db, U.A, { tag: "R1", sex: "M", category: "reprodutor", entryDate: "2025-01-01" });
    await createBreedings(db, U.A, { eweTags: ["M1"], ramTag: "R1", date: "2025-02-01" });
    const exp = await expectedBirths(db, "2025-06-25", 30);
    expect(exp[0]).toMatchObject({ eweTag: "M1", expected: "2025-07-01" });
    const b = await createBirth(db, U.B1, {
      eweTag: "M1",
      date: "2025-07-01",
      bornAlive: 2,
      bornDead: 1,
      birthType: "normal",
      lambs: [
        { tag: "C1", sex: "F" },
        { tag: "C2", sex: "M" },
      ],
    });
    expect(b.lambIds).toHaveLength(2);
    const [c1] = await db.select().from(animals).where(eq(animals.tag, "C1"));
    const [r1] = await db.select().from(animals).where(eq(animals.tag, "R1"));
    expect(c1.motherId).not.toBeNull();
    expect(c1.fatherId).toBe(r1.id); // pai presumido pela cobertura
    expect(c1.category).toBe("cordeiro");
    await expect(
      createBirth(db, U.B1, { eweTag: "M1", date: "2025-07-10", bornAlive: 1, bornDead: 0, lambs: [] }),
    ).rejects.toThrow(/Já existe parto/);
    await createWeanings(db, U.B2, { date: "2025-09-30", items: [{ tag: "C1", weightKg: 21.5 }] });
    const [c1b] = await db.select().from(animals).where(eq(animals.tag, "C1"));
    expect(c1b.category).toBe("borrego");
  });

  it("morte exige causa; venda gera receita rateada; baixa pode ser desfeita", async () => {
    await expect(registerExit(db, U.A, { tag: "C2", type: "morte", date: "2025-08-01" })).rejects.toThrow(/causa/);
    await registerExit(db, U.A, { tag: "C2", type: "morte", date: "2025-08-01", cause: "Pneumonia" });
    await expect(registerExit(db, U.A, { tag: "C2", type: "abate", date: "2025-08-02" })).rejects.toThrow(/já tem baixa/);

    const sale = await registerSale(db, U.B1, {
      date: "2025-10-10",
      buyer: "Frigorífico",
      priceMode: "kg",
      unitPriceCents: 1333, // R$ 13,33/kg
      items: [{ tag: "C1", weightKg: 30.5 }],
      createRevenue: true,
      receivedByUserId: U.B1.id,
    });
    expect(sale.totalCents).toBe(40657); // 13,33 × 30,5 = 406,565 → 406,57
    const [rev] = await db.select().from(revenues).where(eq(revenues.id, sale.revenueId!));
    expect(rev.party).toBe("B");
    expect(await computeBalance(db)).toBe(13552); // B recebeu → deve 1/3 (135,52) a A

    await undoExit(db, U.B1, sale.exitIds[0]);
    const [c1] = await db.select().from(animals).where(eq(animals.tag, "C1"));
    expect(c1.status).toBe("ativo");
    expect(await computeBalance(db)).toBe(0); // receita da venda excluída junto
  });

  it("carência bloqueia venda/abate até confirmação", async () => {
    await createHealthEvents(db, U.A, { type: "tratamento", date: addDays(today, -1), product: "Oxitetraciclina", withdrawalDays: 28, items: [{ tag: "C1" }] });
    await expect(registerExit(db, U.A, { tag: "C1", type: "abate", date: today })).rejects.toThrow(/carência/);
    const alerts = await getAlerts(db);
    expect(alerts.withdrawals.map((w) => w.tag)).toContain("C1");
  });

  it("alterar categoria registra histórico com data", async () => {
    const [m] = await db.select().from(animals).where(eq(animals.tag, "M1"));
    await updateAnimal(db, U.A, m.id, { category: "descarte", changeDate: "2025-12-01" });
    const dash = await dashboard(db, { start: "2025-01-01", end: "2025-12-31" });
    const nov = dash.herd.evolution.find((p) => p.date === "2025-11-30")!;
    expect(nov.matriz).toBe(1);
    expect(dash.herd.current.descarte).toBe(1);
    expect(dash.repro.prolificidade.value).toBe(3);
    expect(dash.mortality.lambs.numerator).toBe(1);
    const detail = await eweDetail(db, m.id);
    expect(detail!.stats.births).toBe(1);
  });

  it("recontagem aponta faltantes e não cadastrados", async () => {
    const c = await createCount(db, U.B1, { date: today });
    await addCountTag(db, U.B1, c.id, { tag: "M1" });
    await addCountTag(db, U.B1, c.id, { tag: "Z99" });
    expect((await addCountTag(db, U.B1, c.id, { tag: "M1" })).added).toBe(false);
    const cmp = await countComparison(db, c.id);
    expect(cmp.missing.map((m) => m.tag).sort()).toEqual(["C1", "R1"]);
    expect(cmp.unexpected).toEqual([{ tag: "Z99", animalId: null, reason: "Não cadastrado" }]);
    const done = await finishCount(db, U.B1, c.id, { resolution: "R1 estava na baia" });
    expect(done.status).toBe("concluida");
    await expect(createCount(db, U.B1, { date: today })).resolves.toBeTruthy();
  });

  it("importação por planilha valida e grava tudo ou nada", async () => {
    const csv = "brinco;sexo;categoria;nascimento;idade_meses;mae;lote\nI1;F;matriz;10/01/2022;;;Lote X\nI2;F;borrega;;8;I1;Lote X\n";
    const rows = await parseHerdSheet({ name: "a.csv", buffer: Buffer.from(csv) });
    const pv = await previewImport(db, rows);
    expect(pv.invalid).toBe(0);
    await commitImport(db, U.A, rows);
    const [i2] = await db.select().from(animals).where(eq(animals.tag, "I2"));
    const [i1] = await db.select().from(animals).where(eq(animals.tag, "I1"));
    expect(i2.motherId).toBe(i1.id);
    expect(i1.birthDate).toBe("2022-01-10");

    const bad = await parseHerdSheet({ name: "b.csv", buffer: Buffer.from("brinco;sexo;categoria\nI1;F;matriz\nI3;X;matriz\n") });
    const pv2 = await previewImport(db, bad);
    expect(pv2.invalid).toBe(2);
    await expect(commitImport(db, U.A, bad)).rejects.toThrow(/linha\(s\) com erro/);
  });

  it("autenticação: login, sessão válida e bloqueio por tentativas", async () => {
    await expect(login(db, "b1@t.com", "errada")).rejects.toThrow(/inválidos/);
    const { token } = await login(db, "B1@t.com", "senha-teste-123");
    const u = await userFromToken(db, token);
    expect(u).toMatchObject({ id: U.B1.id, party: "B", role: "socio" });
    expect(await userFromToken(db, "token-falso")).toBeNull();
    expect(await userFromToken(db, undefined)).toBeNull();
    // sessão expirada
    const s = await createSession(db, U.B1.id);
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await userFromToken(db, s.token)).toBeNull();
    for (let i = 0; i < 8; i++) await login(db, "b2@t.com", "x").catch(() => {});
    await expect(login(db, "b2@t.com", "senha-teste-123")).rejects.toThrow(/Muitas tentativas/);
  });
});
