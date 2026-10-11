import { asc } from "drizzle-orm";
import type { Exec } from "@/db";
import { animalCategoryChanges, animalExits, animals, births, breedings, pregnancyChecks, weanings } from "@/db/schema";
import { addDays, todayIso } from "@/domain/dates";
import {
  averageHeadcount,
  averageWeaningWeight,
  birthIntervalsByEwe,
  birthRate,
  birthsPerEwePerYear,
  costPerHead,
  eweStats,
  herdBirthInterval,
  herdByCategory,
  herdEvolution,
  lambingRate,
  mortality,
  preWeaningMortality,
  prolificacy,
  rankEwes,
  unproductiveEwes,
  weaningRate,
  type AnimalRec,
  type BirthRec,
  type Category,
  type ExitRec,
  type Period,
} from "@/domain/indices";
import { describeBalance, partyTotals, type Party } from "@/domain/ledger";
import { buildLedger } from "@/domain/ledger";
import { getShares, ledgerInputs, listExpenses, listRevenues } from "./finance";

export interface DashboardFilter {
  start: string;
  end: string;
  party?: Party | null;
  lotId?: number | null;
}

export function defaultPeriod(): { start: string; end: string } {
  const end = todayIso();
  return { start: addDays(end, -364), end };
}

/** Carrega o rebanho completo no formato das funções de índice. */
export async function loadHerd(db: Exec) {
  const [an, cats, bth, brd, wn, ex, pg] = await Promise.all([
    db.select().from(animals),
    db.select().from(animalCategoryChanges).orderBy(asc(animalCategoryChanges.date), asc(animalCategoryChanges.id)),
    db.select().from(births),
    db.select().from(breedings),
    db.select().from(weanings),
    db.select().from(animalExits),
    db.select().from(pregnancyChecks),
  ]);
  const hist = new Map<number, { date: string; category: Category }[]>();
  for (const c of cats) {
    const arr = hist.get(c.animalId) ?? [];
    arr.push({ date: c.date, category: c.toCategory });
    hist.set(c.animalId, arr);
  }
  const herd: AnimalRec[] = an.map((a) => ({
    id: a.id,
    tag: a.tag,
    sex: a.sex,
    category: a.category,
    status: a.status,
    birthDate: a.birthDate,
    entryDate: a.entryDate,
    exitDate: a.exitDate,
    motherId: a.motherId,
    birthId: a.birthId,
    lotId: a.lotId,
    categoryHistory: hist.get(a.id),
  }));
  return {
    animals: herd,
    births: bth.map((b): BirthRec => ({ id: b.id, eweId: b.eweId, date: b.date, bornAlive: b.bornAlive, bornDead: b.bornDead })),
    breedings: brd.map((b) => ({ id: b.id, eweId: b.eweId, date: b.date })),
    weanings: wn.map((w) => ({ animalId: w.animalId, date: w.date, weightG: w.weightG })),
    exits: ex.map((e): ExitRec => ({ animalId: e.animalId, type: e.type, date: e.date, cause: e.cause })),
    pregnancies: pg.map((p) => ({ eweId: p.eweId, date: p.date, result: p.result })),
    raw: { animals: an },
  };
}

export type Herd = Awaited<ReturnType<typeof loadHerd>>;

/** Restringe o rebanho a um lote (lote atual do animal; partos pela matriz; crias pela mãe). */
export function filterHerdByLot(h: Herd, lotId: number | null | undefined): Herd {
  if (!lotId) return h;
  const ids = new Set(h.animals.filter((a) => a.lotId === lotId).map((a) => a.id));
  return {
    ...h,
    animals: h.animals.filter((a) => ids.has(a.id)),
    births: h.births.filter((b) => ids.has(b.eweId)),
    breedings: h.breedings.filter((b) => ids.has(b.eweId)),
    weanings: h.weanings.filter((w) => ids.has(w.animalId)),
    exits: h.exits.filter((e) => ids.has(e.animalId)),
    pregnancies: h.pregnancies.filter((p) => ids.has(p.eweId)),
  };
}

export async function dashboard(db: Exec, f: DashboardFilter) {
  const p: Period = { start: f.start, end: f.end };
  const herd = filterHerdByLot(await loadHerd(db), f.lotId);
  const { animals: an, births: bt, breedings: br, weanings: wn, exits: ex, pregnancies: pg } = herd;

  // ---- efetivo
  const current = herdByCategory(an, p.end);
  const atStart = herdByCategory(an, addDays(p.start, -1));
  const evolution = herdEvolution(an, p);

  // ---- reprodução
  const repro = {
    natalidade: birthRate(br, bt, p),
    paricao: lambingRate(br, bt, p),
    prolificidade: prolificacy(bt, p),
    iep: herdBirthInterval(bt, p),
    partosMatrizAno: birthsPerEwePerYear(an, bt, p),
  };
  const mort = mortality(an, ex, p);
  const lambMort = preWeaningMortality(an, bt, wn, ex, p);
  const wean = { taxa: weaningRate(an, bt, wn, p), peso: averageWeaningWeight(wn, p) };

  // ---- matrizes
  const ewes = an.filter((a) => a.sex === "F" && (a.category === "matriz" || a.category === "descarte" || bt.some((b) => b.eweId === a.id)));
  const stats = ewes.map((e) => eweStats(e, an, bt, wn, ex, p.end));
  const statsMap = new Map(stats.map((s) => [s.eweId, s]));
  const ranking = rankEwes(stats.filter((s) => an.find((a) => a.id === s.eweId)?.status === "ativo"));
  const unproductive = unproductiveEwes(ewes, statsMap, pg, p.end);
  const intervals = birthIntervalsByEwe(bt);
  const completeness = {
    ewesActive: ewes.filter((e) => e.status === "ativo").length,
    ewesWithInterval: [...intervals.values()].filter((v) => v.intervals.length > 0).length,
    animalsUnknownBirth: an.filter((a) => a.status === "ativo" && !a.birthDate).length,
    animalsUnknownMother: an.filter((a) => a.status === "ativo" && !a.motherId).length,
    inventoryAnimals: herd.raw.animals.filter((a) => a.origin === "inventario" && (!f.lotId || a.lotId === f.lotId)).length,
    firstRecordDate: [...bt.map((b) => b.date), ...an.map((a) => a.entryDate)].sort()[0] ?? null,
  };

  // ---- finanças
  const [shares, inputs, expList, revList] = await Promise.all([
    getShares(db),
    ledgerInputs(db),
    listExpenses(db, { start: p.start, end: p.end, lotId: f.lotId, party: f.party ?? null }),
    listRevenues(db, { start: p.start, end: p.end, lotId: f.lotId, party: f.party ?? null }),
  ]);
  const expTotal = expList.reduce((s, e) => s + e.amountCents, 0);
  const revTotal = revList.reduce((s, r) => s + r.amountCents, 0);
  const byCategory = new Map<string, number>();
  for (const e of expList) byCategory.set(e.categoryName, (byCategory.get(e.categoryName) ?? 0) + e.amountCents);
  const revByCategory = new Map<string, number>();
  for (const r of revList) revByCategory.set(r.categoryName, (revByCategory.get(r.categoryName) ?? 0) + r.amountCents);

  // Totais por parte (pago, recebido, fração de cada uma e resultado): sempre com as DUAS partes,
  // pois o rateio depende de ambas; o filtro de lote se aplica, o de parte não.
  const [expAll, revAll] = f.party
    ? await Promise.all([
        listExpenses(db, { start: p.start, end: p.end, lotId: f.lotId }),
        listRevenues(db, { start: p.start, end: p.end, lotId: f.lotId }),
      ])
    : [expList, revList];
  const expIds = new Set(expAll.map((e) => e.id));
  const revIds = new Set(revAll.map((r) => r.id));
  const totals = partyTotals(
    inputs.filter(
      (e) =>
        e.date >= p.start &&
        e.date <= p.end &&
        (e.kind === "despesa" ? expIds.has(e.id) : e.kind === "receita" ? revIds.has(e.id) : !f.lotId),
    ),
    shares,
  );
  const ledger = buildLedger(inputs, shares);
  const balance = ledger.length ? ledger[ledger.length - 1].balance : 0;

  const avgHead = averageHeadcount(an, p);
  return {
    period: p,
    herd: { current, atStart, evolution, averageHeadcount: avgHead },
    repro,
    mortality: { ...mort, lambs: lambMort },
    weaning: wean,
    ewes: { ranking, unproductive, completeness },
    finance: {
      expenseTotal: expTotal,
      revenueTotal: revTotal,
      result: revTotal - expTotal,
      costPerHead: costPerHead(expTotal, an, p),
      expenseByCategory: [...byCategory.entries()].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents),
      revenueByCategory: [...revByCategory.entries()].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents),
      totals,
      balance,
      balanceDesc: describeBalance(balance),
    },
  };
}

export type Dashboard = Awaited<ReturnType<typeof dashboard>>;

/** Dados completos da página individual da matriz. */
export async function eweDetail(db: Exec, eweId: number, refDate = todayIso()) {
  const herd = await loadHerd(db);
  const ewe = herd.animals.find((a) => a.id === eweId);
  if (!ewe) return null;
  const stats = eweStats(ewe, herd.animals, herd.births, herd.weanings, herd.exits, refDate);
  const own = herd.births.filter((b) => b.eweId === eweId).sort((a, b) => a.date.localeCompare(b.date));
  const lambs = herd.raw.animals.filter((a) => a.motherId === eweId);
  const weanMap = new Map(herd.weanings.map((w) => [w.animalId, w]));
  const exitMap = new Map(herd.exits.map((e) => [e.animalId, e]));
  const birthsDetailed = own.map((b, i) => ({
    ...b,
    intervalDays: i > 0 ? stats.intervals[i - 1] : null,
    lambs: lambs
      .filter((l) => l.birthId === b.id)
      .map((l) => ({ id: l.id, tag: l.tag, sex: l.sex, status: l.status, weaning: weanMap.get(l.id) ?? null, exit: exitMap.get(l.id) ?? null })),
  }));
  // custos: despesas vinculadas diretamente + rateio estimado das despesas gerais pelo custo por dia-animal
  const allExp = await listExpenses(db, {});
  const direct = allExp.filter((e) => e.animalId === eweId);
  const directTotal = direct.reduce((s, e) => s + e.amountCents, 0);
  const general = allExp.filter((e) => !e.animalId);
  const firstDate = [...herd.animals.map((a) => a.entryDate)].sort()[0] ?? refDate;
  const p = { start: firstDate, end: refDate };
  // custo diário por cabeça do período inteiro × dias da matriz no rebanho
  const avg = averageHeadcount(herd.animals, p);
  const days = Math.max(0, Math.round(((ewe.exitDate ? new Date(ewe.exitDate) : new Date(refDate)).getTime() - new Date(ewe.entryDate).getTime()) / 86_400_000));
  const totalDays = Math.max(1, Math.round((new Date(refDate).getTime() - new Date(firstDate).getTime()) / 86_400_000) + 1);
  const generalTotal = general.reduce((s, e) => s + e.amountCents, 0);
  const estimatedShare = avg > 0 ? Math.round((generalTotal / (avg * totalDays)) * days) : 0;
  const pregnancies = herd.pregnancies.filter((x) => x.eweId === eweId).sort((a, b) => b.date.localeCompare(a.date));
  const lastBreeding = herd.breedings.filter((b) => b.eweId === eweId).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  return {
    ewe,
    stats,
    births: birthsDetailed,
    pregnancies,
    lastBreeding,
    costs: { direct, directTotal, estimatedShare, daysInHerd: days },
  };
}

