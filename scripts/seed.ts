/**
 * Dados de demonstração: 3 usuários (2 partes), 50 animais ativos (2 reprodutores, 30 matrizes),
 * ~2 anos de estações de monta, partos, desmames, sanidade, baixas, despesas, receitas,
 * reembolsos e um período fechado.
 *
 * Os eventos são executados em ordem cronológica usando os próprios serviços da aplicação,
 * de modo que todas as regras de negócio (validações, auditoria, rateio) são respeitadas.
 *
 * Uso: npm run db:seed   (o banco deve estar migrado e vazio — use npm run db:reset)
 */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { animals, categories, lots, users } from "@/db/schema";
import { addDays, todayIso } from "@/domain/dates";
import { computeBalance, createExpense, createReimbursement, createRevenue } from "@/server/services/finance";
import { createAnimal, updateAnimal } from "@/server/services/animals";
import { createBirth, createBreedings, createPregnancyCheck, createWeanings } from "@/server/services/reproduction";
import { createHealthEvents, createWeighings } from "@/server/services/health";
import { registerExit, registerSale } from "@/server/services/exits";
import { closePeriod } from "@/server/services/locks";
import { hashPasswordForSeed } from "./seed-helpers";
import type { Actor } from "@/domain/policy";

// ---------------------------------------------------------------- PRNG determinístico
let s = 20240901;
function rand() {
  s |= 0;
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
const chance = (p: number) => rand() < p;

// ---------------------------------------------------------------- Fila de eventos cronológica
type Ev = { date: string; prio: number; run: () => Promise<void>; label: string };
const queue: Ev[] = [];
const TODAY = todayIso();
function at(date: string, label: string, run: () => Promise<void>, prio = 5) {
  if (date > TODAY) return;
  queue.push({ date, prio, run, label });
}

async function main() {
  const db: DB = getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  if (n > 0) {
    console.error("O banco já possui usuários. Rode `npm run db:reset` para recriar com dados de demonstração.");
    process.exit(1);
  }

  // ---- usuários e lotes
  const pw = await hashPasswordForSeed("demo1234");
  const [ua, ub1, ub2] = await db
    .insert(users)
    .values([
      { name: "André (admin)", email: "admin@demo.com", passwordHash: pw, role: "admin", party: "A" },
      { name: "Bruno", email: "bruno@demo.com", passwordHash: pw, role: "socio", party: "B" },
      { name: "Bernardo", email: "bernardo@demo.com", passwordHash: pw, role: "socio", party: "B" },
    ])
    .returning();
  const actor = (u: typeof ua): Actor => ({ id: u.id, role: u.role, party: u.party, active: true });
  const A = actor(ua);
  const B1 = actor(ub1);
  const B2 = actor(ub2);
  const people = [A, B1, B2];
  const randomPerson = () => (chance(0.4) ? A : chance(0.5) ? B1 : B2);

  const lotRows = await db
    .insert(lots)
    .values([
      { name: "Piquete 1 – Matrizes", description: "Pasto principal" },
      { name: "Piquete 2 – Recria", description: "Borregos após desmame" },
      { name: "Reprodutores", description: "Baia dos carneiros" },
    ])
    .returning();
  const [lotMatrizes, lotRecria, lotRep] = lotRows;

  const cats = await db.select().from(categories);
  const cat = (kind: "despesa" | "receita", name: string) => cats.find((c) => c.kind === kind && c.name === name)!.id;

  const expense = (date: string, who: Actor, category: string, cents: number, description: string, extra: object = {}) =>
    at(date, `despesa ${description}`, async () => {
      await createExpense(db, who, {
        date,
        amountCents: cents,
        categoryId: cat("despesa", category),
        description,
        paidByUserId: who.id,
        ...extra,
      });
    }, 1);
  const revenue = (date: string, who: Actor, category: string, cents: number, description: string) =>
    at(date, `receita ${description}`, async () => {
      await createRevenue(db, who, {
        date,
        amountCents: cents,
        categoryId: cat("receita", category),
        description,
        receivedByUserId: who.id,
      });
    }, 1);

  // ---- reprodutores (comprados) e matrizes (inventário inicial)
  const START = "2024-08-01";
  expense("2024-06-01", A, "Compra de animais", 360000, "Compra de 2 reprodutores Dorper");
  expense("2024-06-01", B1, "Transporte", 45000, "Frete dos reprodutores");
  at("2024-06-01", "reprodutores", async () => {
    await createAnimal(db, A, { tag: "R01", sex: "M", breed: "Dorper", ageMonths: 24, category: "reprodutor", origin: "compra", entryDate: "2024-06-01", lotId: lotRep.id });
    await createAnimal(db, A, { tag: "R02", sex: "M", breed: "Dorper", ageMonths: 20, category: "reprodutor", origin: "compra", entryDate: "2024-06-01", lotId: lotRep.id });
  }, 0);

  const eweTags = Array.from({ length: 30 }, (_, i) => `M${String(i + 1).padStart(3, "0")}`);
  const NEVER_PREGNANT = new Set(["M029", "M030"]);
  const alive = new Set<string>(); // matrizes ativas no momento
  at(START, "inventário das matrizes", async () => {
    for (const [i, tag] of eweTags.entries()) {
      const known = i % 2 === 0;
      await createAnimal(db, A, {
        tag,
        sex: "F",
        breed: pick(["Santa Inês", "Santa Inês", "Dorper × Santa Inês", "Morada Nova"]),
        birthDate: known ? addDays(START, -between(700, 2000)) : null,
        ageMonths: known ? null : between(24, 66),
        category: "matriz",
        origin: "inventario",
        entryDate: START,
        lotId: lotMatrizes.id,
        notes: known ? null : "Idade estimada pela dentição no inventário inicial",
      });
      alive.add(tag);
    }
  }, 0);

  // ---- estações de monta
  const seasons = [
    { name: "Estação 2024/2", start: "2024-09-10" },
    { name: "Estação 2025/1", start: "2025-04-10" },
    { name: "Estação 2025/2", start: "2025-11-05" },
    { name: "Estação 2026/1", start: "2026-06-15" },
  ];
  let lambSeq = 0;
  const lambsBySeason: Map<number, { tag: string; sex: "M" | "F"; birth: string }[]> = new Map();
  const deadLambs = new Set<string>();

  seasons.forEach((season, si) => {
    lambsBySeason.set(si, []);
    at(season.start, `cobertura ${season.name}`, async () => {
      const exposed = [...alive];
      const half = Math.ceil(exposed.length / 2);
      for (const [ram, list] of [["R01", exposed.slice(0, half)], ["R02", exposed.slice(half)]] as const) {
        if (!list.length) continue;
        await createBreedings(db, pick(people), {
          eweTags: list,
          ramTag: ram,
          date: season.start,
          endDate: addDays(season.start, 45),
          method: "monta_natural",
          seasonName: season.name,
        });
      }
      // define concepção e agenda diagnóstico e parto
      for (const tag of exposed) {
        const conceived = !NEVER_PREGNANT.has(tag) && chance(si === 3 ? 0.88 : 0.86);
        const dDate = addDays(season.start, 60);
        at(dDate, `diagnóstico ${tag}`, async () => {
          if (!alive.has(tag)) return;
          await createPregnancyCheck(db, B1, { eweTag: tag, date: dDate, result: conceived ? "prenhe" : "vazia", method: "Ultrassom" });
        });
        if (!conceived) continue;
        const bDate = addDays(season.start, between(146, 175));
        at(bDate, `parto ${tag}`, async () => {
          if (!alive.has(tag)) return;
          const r = rand();
          const total = r < 0.58 ? 1 : r < 0.95 ? 2 : 3;
          const dead = chance(0.07) ? 1 : 0;
          const bornAlive = Math.max(0, total - dead);
          const bornDead = total - bornAlive;
          const yy = bDate.slice(2, 4);
          const lambs = Array.from({ length: bornAlive }, () => ({
            tag: `${yy}-${String(++lambSeq).padStart(3, "0")}`,
            sex: (chance(0.5) ? "M" : "F") as "M" | "F",
            weightKg: Math.round((3 + rand() * 2.5) * 10) / 10,
          }));
          await createBirth(db, pick(people), {
            eweTag: tag,
            date: bDate,
            bornAlive,
            bornDead,
            birthType: chance(0.1) ? "assistido" : "normal",
            lambs,
          });
          for (const l of lambs) {
            lambsBySeason.get(si)!.push({ tag: l.tag, sex: l.sex, birth: bDate });
            // mortalidade até o desmame (~8%)
            if (chance(0.08)) {
              const dd = addDays(bDate, between(2, 45));
              deadLambs.add(l.tag);
              at(dd, `morte cordeiro ${l.tag}`, async () => {
                await registerExit(db, pick(people), {
                  tag: l.tag,
                  type: "morte",
                  date: dd,
                  cause: pick(["Hipotermia", "Inanição", "Pneumonia", "Diarreia", "Ataque de cachorro"]),
                });
              });
              continue;
            }
            const wd = addDays(bDate, between(85, 95));
            at(wd, `desmame ${l.tag}`, async () => {
              await createWeanings(db, pick(people), {
                date: wd,
                items: [{ tag: l.tag, weightKg: Math.round((14 + rand() * 10 + (l.sex === "M" ? 2 : 0)) * 10) / 10 }],
              });
              await updateAnimal(db, A, (await idOf(db, l.tag))!, { lotId: lotRecria.id, changeDate: wd });
            });
          }
        });
      }
    });
  });

  // ---- vendas e retenção de borregas
  const sellSeason = (si: number, date: string, buyer: string, keep: (l: { tag: string; sex: "M" | "F" }) => boolean, keepCount = Infinity) =>
    at(date, `venda estação ${si}`, async () => {
      const lambs = (lambsBySeason.get(si) ?? []).filter((l) => !deadLambs.has(l.tag));
      let kept = 0;
      const sell: { tag: string; weightKg: number }[] = [];
      const own: string[] = [];
      for (const l of lambs) {
        const a = await db.select().from(animals).where(eq(animals.tag, l.tag));
        if (!a[0] || a[0].status !== "ativo") continue;
        if (kept < keepCount && keep(l)) {
          kept++;
          continue;
        }
        if (own.length < 2 && chance(0.15)) own.push(l.tag);
        else sell.push({ tag: l.tag, weightKg: Math.round((30 + rand() * 12) * 10) / 10 });
      }
      if (sell.length) {
        await registerSale(db, pick(people), {
          date,
          buyer,
          priceMode: "kg",
          unitPriceCents: between(1150, 1450),
          items: sell,
          createRevenue: true,
          receivedByUserId: pick(people).id,
          ignoreWithdrawal: true,
        });
        expense(addDays(date, 0), pick(people), "Transporte", between(15000, 30000), `Frete da venda para ${buyer}`);
      }
      for (const t of own)
        await registerExit(db, pick(people), { tag: t, type: chance(0.5) ? "consumo_proprio" : "abate", date: addDays(date, 2), cause: null, weightKg: 35, ignoreWithdrawal: true });
    }, 6);

  const retained: string[] = [];
  sellSeason(0, "2025-08-20", "Frigorífico Boa Carne", (l) => {
    if (l.sex === "F" && retained.length < 3) {
      retained.push(l.tag);
      return true;
    }
    return false;
  });
  at("2026-01-15", "promoção de borregas a matriz", async () => {
    for (const t of retained) {
      await updateAnimal(db, A, (await idOf(db, t))!, { category: "matriz", lotId: lotMatrizes.id, changeDate: "2026-01-15" });
      alive.add(t);
    }
  });
  sellSeason(1, "2026-03-10", "Sr. Antônio (Fazenda Esperança)", () => false);

  // ---- baixas de adultos
  at("2025-07-20", "morte M007", async () => {
    alive.delete("M007");
    await registerExit(db, B2, { tag: "M007", type: "morte", date: "2025-07-20", cause: "Verminose (Haemonchus)" });
  }, 7);
  at("2026-02-03", "morte M015", async () => {
    alive.delete("M015");
    await registerExit(db, B1, { tag: "M015", type: "morte", date: "2026-02-03", cause: "Toxemia da prenhez" });
  }, 7);
  at("2026-02-01", "descarte M022", async () => {
    alive.delete("M022");
    await updateAnimal(db, A, (await idOf(db, "M022"))!, { category: "descarte", changeDate: "2026-02-01" });
  }, 7);
  at("2026-03-15", "abate M022", async () => {
    await registerExit(db, A, { tag: "M022", type: "abate", date: "2026-03-15", cause: "Descarte por idade", weightKg: 48, ignoreWithdrawal: true });
  }, 7);

  // ---- ajusta o efetivo final para 50 animais ativos vendendo o excedente da estação 2025/2
  at(addDays(TODAY, -21), "venda final para fechar 50 animais", async () => {
    const [{ active }] = await db.select({ active: sql<number>`count(*)::int` }).from(animals).where(eq(animals.status, "ativo"));
    const excess = active - 50;
    if (excess <= 0) return;
    const cands = await db
      .select({ tag: animals.tag, sex: animals.sex })
      .from(animals)
      .where(sql`${animals.status} = 'ativo' and ${animals.category} in ('borrego','cordeiro') and ${animals.origin} = 'nascimento'`)
      .orderBy(sql`${animals.sex} desc`, animals.birthDate);
    const sell = cands.slice(0, excess).map((c) => ({ tag: c.tag, weightKg: Math.round((28 + rand() * 8) * 10) / 10 }));
    if (!sell.length) return;
    await registerSale(db, B1, {
      date: addDays(TODAY, -21),
      buyer: "Feira de Caprinos e Ovinos",
      priceMode: "cabeca",
      unitPriceCents: 42000,
      items: sell,
      createRevenue: true,
      receivedByUserId: B1.id,
      ignoreWithdrawal: true,
    });
  }, 9);

  // ---- sanidade
  const deworm = ["Closantel 10%", "Monepantel", "Levamisol", "Moxidectina"];
  for (let d = "2024-08-05", i = 0; d <= TODAY; d = addDays(d, between(80, 100)), i++) {
    const date = d;
    const product = deworm[i % deworm.length];
    at(date, `vermifugação ${date}`, async () => {
      const act = await db.select({ tag: animals.tag }).from(animals).where(sql`${animals.status} = 'ativo' and ${animals.entryDate} <= ${date}`);
      if (!act.length) return;
      await createHealthEvents(db, pick(people), {
        type: "vermifugacao",
        date,
        product,
        dose: "1 ml / 10 kg",
        withdrawalDays: 28,
        nextDoseDate: addDays(date, 90),
        items: act.map((a) => ({ tag: a.tag, famacha: chance(0.7) ? pick([1, 2, 2, 3, 3, 4, 5]) : null })),
      });
    }, 3);
    expense(date, pick(people), "Medicamentos", between(18000, 42000), `Vermífugo ${product}`);
  }
  for (const date of ["2024-10-26", "2025-10-26"]) {
    at(date, `vacina ${date}`, async () => {
      const act = await db.select({ tag: animals.tag }).from(animals).where(sql`${animals.status} = 'ativo' and ${animals.entryDate} <= ${date}`);
      await createHealthEvents(db, A, {
        type: "vacina",
        date,
        product: "Polivalente clostridioses",
        dose: "2 ml SC",
        nextDoseDate: addDays(date, 365),
        items: act.map((a) => ({ tag: a.tag })),
      });
    }, 3);
    expense(date, A, "Medicamentos", 26000, "Vacina polivalente clostridioses (frasco 50 doses)");
  }
  at(addDays(TODAY, -8), "tratamento recente", async () => {
    await createHealthEvents(db, B2, {
      type: "tratamento",
      date: addDays(TODAY, -8),
      product: "Oxitetraciclina LA",
      dose: "1 ml / 10 kg IM",
      withdrawalDays: 28,
      notes: "Pododermatite",
      items: [{ tag: "M003" }],
    });
  }, 3);
  // escore corporal das matrizes antes de cada estação
  for (const season of seasons) {
    const date = addDays(season.start, -7);
    at(date, `ECC ${date}`, async () => {
      const act = await db.select({ tag: animals.tag }).from(animals).where(sql`${animals.status} = 'ativo' and ${animals.category} = 'matriz'`);
      await createWeighings(db, B1, {
        date,
        items: act.map((a) => ({ tag: a.tag, weightKg: Math.round((42 + rand() * 18) * 10) / 10, bodyScore: pick([2, 2.5, 3, 3, 3.5, 4]) })),
      });
    }, 3);
  }

  // ---- despesas recorrentes e receitas diversas
  for (let m = "2024-08-10"; m <= TODAY; m = addDays(m, 30)) {
    expense(m, randomPerson(), "Ração/sal mineral", between(28000, 95000), "Sal mineral e ração");
    expense(addDays(m, 5), chance(0.5) ? B1 : B2, "Mão de obra", 60000, "Diária do ajudante (mensal)");
    if (chance(0.25)) expense(addDays(m, 12), randomPerson(), "Veterinário", between(15000, 45000), "Visita do veterinário");
  }
  expense("2024-08-20", A, "Cerca e infraestrutura", 185000, "Cerca elétrica do piquete 2");
  expense("2025-03-02", B2, "Cerca e infraestrutura", 92000, "Reforma do aprisco");
  expense("2026-05-18", B1, "Cerca e infraestrutura", 47550, "Bebedouros");
  expense("2025-09-01", A, "Outros", 12345, "Brincos e aplicador");
  revenue("2025-01-20", A, "Lã", 38000, "Venda de lã");
  revenue("2026-01-25", B2, "Lã", 41000, "Venda de lã");
  for (const d of ["2025-04-05", "2025-10-12", "2026-04-08", "2026-09-15"]) revenue(d, randomPerson(), "Esterco", between(18000, 30000), "Venda de esterco");

  // ---- reembolsos e fechamento de período
  at("2025-01-15", "reembolso 1", async () => {
    const bal = await computeBalance(db, "2025-01-15");
    if (bal > 0) await createReimbursement(db, B1, { date: "2025-01-15", amountCents: Math.round(bal / 2), fromParty: "B", paidByUserId: B1.id, method: "pix", notes: "Acerto parcial" });
    else if (bal < 0) await createReimbursement(db, A, { date: "2025-01-15", amountCents: Math.round(-bal / 2), fromParty: "A", paidByUserId: A.id, method: "pix", notes: "Acerto parcial" });
  }, 8);
  at("2025-06-30", "acerto total", async () => {
    const bal = await computeBalance(db, "2025-06-30");
    if (bal > 0) await createReimbursement(db, B2, { date: "2025-06-30", amountCents: bal, fromParty: "B", paidByUserId: B2.id, method: "transferencia", notes: "Acerto do 1º semestre de 2025" });
    else if (bal < 0) await createReimbursement(db, A, { date: "2025-06-30", amountCents: -bal, fromParty: "A", paidByUserId: A.id, method: "transferencia", notes: "Acerto do 1º semestre de 2025" });
  }, 8);
  at("2025-07-02", "fechamento", async () => {
    await closePeriod(db, A, { lockedUntil: "2025-06-30", notes: "Acerto do 1º semestre de 2025 — saldo zerado" });
  }, 9);
  at("2026-01-10", "reembolso 3", async () => {
    const bal = await computeBalance(db, "2026-01-10");
    const amt = Math.round(Math.abs(bal) * 0.6);
    if (!amt) return;
    if (bal > 0) await createReimbursement(db, B1, { date: "2026-01-10", amountCents: amt, fromParty: "B", paidByUserId: B1.id, method: "dinheiro", notes: "Acerto parcial" });
    else await createReimbursement(db, A, { date: "2026-01-10", amountCents: amt, fromParty: "A", paidByUserId: A.id, method: "dinheiro", notes: "Acerto parcial" });
  }, 8);

  // ---- executa em ordem
  let done = 0;
  while (queue.length) {
    queue.sort((a, b) => (a.date === b.date ? a.prio - b.prio : a.date < b.date ? -1 : 1));
    const ev = queue.shift()!;
    try {
      await ev.run();
    } catch (e) {
      console.error(`Falha em ${ev.date} ${ev.label}:`, (e as Error).message);
      throw e;
    }
    done++;
  }
  const [{ active }] = await db.select({ active: sql<number>`count(*)::int` }).from(animals).where(eq(animals.status, "ativo"));
  const balance = await computeBalance(db);
  console.log(`Seed concluído: ${done} eventos, ${active} animais ativos, saldo atual ${(balance / 100).toFixed(2)} (positivo = B deve a A).`);
  console.log("Logins de demonstração (senha demo1234): admin@demo.com (admin, Parte A), bruno@demo.com e bernardo@demo.com (Parte B).");
  process.exit(0);
}

async function idOf(db: DB, tag: string) {
  const [a] = await db.select({ id: animals.id }).from(animals).where(eq(animals.tag, tag));
  return a?.id;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
