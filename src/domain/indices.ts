/**
 * Índices zootécnicos — funções puras, sem acesso a banco.
 *
 * Todo indicador retorna `Indicator`, com numerador, denominador, a fórmula em texto
 * (exibida na interface) e observações sobre completude do histórico.
 */
import { addDays, diffDays, maxIso, minIso } from "./dates";

export type Category = "matriz" | "reprodutor" | "cordeiro" | "borrego" | "descarte";
export const CATEGORIES: Category[] = ["matriz", "reprodutor", "cordeiro", "borrego", "descarte"];
export const ADULT_CATEGORIES: Category[] = ["matriz", "reprodutor", "descarte"];

export const GESTATION_DAYS = 150;

export interface Period {
  start: string;
  end: string;
}

export interface AnimalRec {
  id: number;
  tag: string;
  sex: "M" | "F";
  category: Category;
  status: string;
  birthDate: string | null;
  entryDate: string;
  exitDate: string | null;
  motherId: number | null;
  birthId: number | null;
  lotId: number | null;
  /** Histórico de categorias (inclusive a inicial). Se ausente, usa `category` desde a entrada. */
  categoryHistory?: { date: string; category: Category }[];
}

export interface BirthRec {
  id: number;
  eweId: number;
  date: string;
  bornAlive: number;
  bornDead: number;
}

export interface BreedingRec {
  id: number;
  eweId: number;
  date: string;
}

export interface WeaningRec {
  animalId: number;
  date: string;
  weightG: number | null;
}

export interface ExitRec {
  animalId: number;
  type: "venda" | "morte" | "abate" | "consumo_proprio";
  date: string;
  cause: string | null;
}

export interface PregnancyRec {
  eweId: number;
  date: string;
  result: "prenhe" | "vazia" | "duvidosa";
}

export interface Indicator {
  key: string;
  label: string;
  value: number | null;
  /** "%", "crias/parto", "dias", "kg", ... */
  unit: string;
  numerator: number;
  denominator: number;
  formula: string;
  notes: string[];
}

function ratio(n: number, d: number, pct = false): number | null {
  if (!d) return null;
  return pct ? (n / d) * 100 : n / d;
}

// ---------------------------------------------------------------- Efetivo

/** Categoria do animal numa data (considerando o histórico de categorias). */
export function categoryAt(a: AnimalRec, date: string): Category {
  const hist = a.categoryHistory?.length ? a.categoryHistory : [{ date: a.entryDate, category: a.category }];
  let cat = hist[0].category;
  for (const h of [...hist].sort((x, y) => x.date.localeCompare(y.date))) {
    if (h.date <= date) cat = h.category;
  }
  return cat;
}

/** O animal está no efetivo no fim do dia `date`? (entrou até `date` e não saiu até `date`). */
export function presentOn(a: AnimalRec, date: string): boolean {
  return a.entryDate <= date && (!a.exitDate || a.exitDate > date);
}

/** Esteve presente em algum momento do período? */
export function presentDuring(a: AnimalRec, p: Period): boolean {
  return a.entryDate <= p.end && (!a.exitDate || a.exitDate >= p.start);
}

export function herdByCategory(animals: AnimalRec[], date: string): Record<Category, number> & { total: number } {
  const out = { matriz: 0, reprodutor: 0, cordeiro: 0, borrego: 0, descarte: 0, total: 0 };
  for (const a of animals) {
    if (!presentOn(a, date)) continue;
    out[categoryAt(a, date)]++;
    out.total++;
  }
  return out;
}

/** Efetivo por categoria ao fim de cada mês do período. */
export function herdEvolution(animals: AnimalRec[], p: Period) {
  const points: ({ date: string } & ReturnType<typeof herdByCategory>)[] = [];
  let cursor = p.start.slice(0, 7) + "-01";
  while (cursor <= p.end) {
    const [y, m] = cursor.split("-").map(Number);
    const eom = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const d = minIso(eom, p.end);
    points.push({ date: d, ...herdByCategory(animals, d) });
    cursor = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  }
  return points;
}

/** Dias-animal no período (para efetivo médio). Filtra por categoria se informada. */
export function animalDays(animals: AnimalRec[], p: Period, onlyCategory?: Category): number {
  let total = 0;
  for (const a of animals) {
    if (!presentDuring(a, p)) continue;
    const from = maxIso(a.entryDate, p.start);
    // presença até o dia anterior à saída
    const to = a.exitDate ? minIso(addDays(a.exitDate, -1), p.end) : p.end;
    if (to < from) continue;
    if (!onlyCategory) {
      total += diffDays(from, to) + 1;
      continue;
    }
    // percorre segmentos de categoria
    const hist = (a.categoryHistory?.length ? a.categoryHistory : [{ date: a.entryDate, category: a.category }])
      .slice()
      .sort((x, y) => x.date.localeCompare(y.date));
    for (let i = 0; i < hist.length; i++) {
      if (hist[i].category !== onlyCategory) continue;
      const segFrom = maxIso(hist[i].date, from);
      const segTo = i + 1 < hist.length ? minIso(addDays(hist[i + 1].date, -1), to) : to;
      if (segTo >= segFrom) total += diffDays(segFrom, segTo) + 1;
    }
  }
  return total;
}

export function periodDays(p: Period) {
  return diffDays(p.start, p.end) + 1;
}

export function averageHeadcount(animals: AnimalRec[], p: Period, onlyCategory?: Category): number {
  return animalDays(animals, p, onlyCategory) / periodDays(p);
}

// ---------------------------------------------------------------- Reprodução

const inPeriod = (d: string, p: Period) => d >= p.start && d <= p.end;

/**
 * Matrizes expostas no período = matrizes com cobertura cuja previsão de parto
 * (cobertura + 150 dias) cai no período, somadas às que pariram no período sem
 * cobertura registrada (ex.: animais do inventário inicial).
 */
export function exposedEwes(breedings: BreedingRec[], births: BirthRec[], p: Period): Set<number> {
  const s = new Set<number>();
  for (const b of breedings) if (inPeriod(addDays(b.date, GESTATION_DAYS), p)) s.add(b.eweId);
  for (const b of births) if (inPeriod(b.date, p)) s.add(b.eweId);
  return s;
}

const EXPOSED_DEF =
  "Matrizes expostas = matrizes com cobertura cuja previsão de parto (cobertura + 150 dias) cai no período, mais as que pariram no período sem cobertura registrada.";

export function birthRate(breedings: BreedingRec[], births: BirthRec[], p: Period): Indicator {
  const exposed = exposedEwes(breedings, births, p);
  const born = births.filter((b) => inPeriod(b.date, p)).reduce((s, b) => s + b.bornAlive + b.bornDead, 0);
  const notes = [EXPOSED_DEF];
  if (!breedings.length) notes.push("Sem coberturas registradas: só entram como expostas as matrizes que pariram (índice superestimado).");
  return {
    key: "natalidade",
    label: "Taxa de natalidade",
    value: ratio(born, exposed.size, true),
    unit: "%",
    numerator: born,
    denominator: exposed.size,
    formula: "Crias nascidas (vivas + mortas) no período ÷ matrizes expostas × 100",
    notes,
  };
}

export function lambingRate(breedings: BreedingRec[], births: BirthRec[], p: Period): Indicator {
  const exposed = exposedEwes(breedings, births, p);
  const lambed = new Set(births.filter((b) => inPeriod(b.date, p)).map((b) => b.eweId));
  const notes = [EXPOSED_DEF];
  if (!breedings.length) notes.push("Sem coberturas registradas: o índice tende a 100% e não é confiável.");
  return {
    key: "paricao",
    label: "Taxa de parição",
    value: ratio(lambed.size, exposed.size, true),
    unit: "%",
    numerator: lambed.size,
    denominator: exposed.size,
    formula: "Matrizes paridas no período ÷ matrizes expostas × 100",
    notes,
  };
}

export function prolificacy(births: BirthRec[], p: Period): Indicator {
  const list = births.filter((b) => inPeriod(b.date, p));
  const born = list.reduce((s, b) => s + b.bornAlive + b.bornDead, 0);
  return {
    key: "prolificidade",
    label: "Prolificidade",
    value: ratio(born, list.length),
    unit: "crias/parto",
    numerator: born,
    denominator: list.length,
    formula: "Crias nascidas (vivas + mortas) ÷ número de partos no período",
    notes: [],
  };
}

/** Intervalos entre partos consecutivos de cada matriz (dias). Considera todo o histórico registrado. */
export function birthIntervalsByEwe(births: BirthRec[]): Map<number, { intervals: number[]; dates: string[] }> {
  const byEwe = new Map<number, string[]>();
  for (const b of births) {
    const arr = byEwe.get(b.eweId) ?? [];
    arr.push(b.date);
    byEwe.set(b.eweId, arr);
  }
  const out = new Map<number, { intervals: number[]; dates: string[] }>();
  for (const [ewe, dates] of byEwe) {
    dates.sort();
    const intervals: number[] = [];
    for (let i = 1; i < dates.length; i++) intervals.push(diffDays(dates[i - 1], dates[i]));
    out.set(ewe, { intervals, dates });
  }
  return out;
}

/**
 * Intervalo médio entre partos do rebanho: média de todos os intervalos cujo parto
 * de fechamento ocorreu no período. Só existe a partir do 2º parto registrado da matriz.
 */
export function herdBirthInterval(births: BirthRec[], p: Period): Indicator {
  const byEwe = birthIntervalsByEwe(births.filter((b) => b.date <= p.end));
  const intervals: number[] = [];
  let ewesWithInterval = 0;
  let ewesWithSingle = 0;
  for (const { dates } of byEwe.values()) {
    let has = false;
    for (let i = 1; i < dates.length; i++) {
      if (inPeriod(dates[i], p)) {
        intervals.push(diffDays(dates[i - 1], dates[i]));
        has = true;
      }
    }
    if (has) ewesWithInterval++;
    else if (dates.length === 1 && inPeriod(dates[0], p)) ewesWithSingle++;
  }
  const sum = intervals.reduce((s, v) => s + v, 0);
  const notes = ["O intervalo só existe a partir do 2º parto registrado de cada matriz."];
  if (ewesWithSingle) notes.push(`${ewesWithSingle} matriz(es) com apenas 1 parto registrado não entram no cálculo (histórico incompleto).`);
  return {
    key: "iep",
    label: "Intervalo médio entre partos",
    value: ratio(sum, intervals.length),
    unit: "dias",
    numerator: sum,
    denominator: intervals.length,
    formula: "Soma dos intervalos (dias) entre partos consecutivos ÷ número de intervalos",
    notes,
  };
}

export function birthsPerEwePerYear(animals: AnimalRec[], births: BirthRec[], p: Period): Indicator {
  const eweYears = animalDays(animals, p, "matriz") / 365;
  const n = births.filter((b) => inPeriod(b.date, p)).length;
  return {
    key: "partos_matriz_ano",
    label: "Partos por matriz por ano",
    value: eweYears > 0 ? n / eweYears : null,
    unit: "partos/matriz/ano",
    numerator: n,
    denominator: Math.round(eweYears * 100) / 100,
    formula: "Partos no período ÷ matrizes-ano no período (dias como matriz no efetivo ÷ 365)",
    notes: ["Também pode ser estimado por 365 ÷ intervalo médio entre partos."],
  };
}

// ---------------------------------------------------------------- Mortalidade e desmame

function lambsOfBirths(animals: AnimalRec[], births: BirthRec[]) {
  const ids = new Set(births.map((b) => b.id));
  return animals.filter((a) => a.birthId !== null && ids.has(a.birthId));
}

export function mortality(animals: AnimalRec[], exits: ExitRec[], p: Period) {
  const deaths = exits.filter((e) => e.type === "morte" && inPeriod(e.date, p));
  const byId = new Map(animals.map((a) => [a.id, a]));
  const atRisk = animals.filter((a) => presentDuring(a, p));
  const isAdultIn = (a: AnimalRec) =>
    ADULT_CATEGORIES.includes(categoryAt(a, minIso(p.end, a.exitDate ?? p.end))) ||
    ADULT_CATEGORIES.includes(categoryAt(a, maxIso(p.start, a.entryDate)));
  const adultsAtRisk = atRisk.filter(isAdultIn);
  const adultDeaths = deaths.filter((d) => {
    const a = byId.get(d.animalId);
    return a && ADULT_CATEGORIES.includes(categoryAt(a, d.date));
  });
  const causes = new Map<string, number>();
  for (const d of deaths) {
    const c = (d.cause ?? "").trim() || "Não informada";
    causes.set(c, (causes.get(c) ?? 0) + 1);
  }

  const general: Indicator = {
    key: "mortalidade_geral",
    label: "Mortalidade geral",
    value: ratio(deaths.length, atRisk.length, true),
    unit: "%",
    numerator: deaths.length,
    denominator: atRisk.length,
    formula: "Mortes no período ÷ animais presentes no efetivo em algum momento do período × 100",
    notes: [],
  };
  const adult: Indicator = {
    key: "mortalidade_adultos",
    label: "Mortalidade de adultos",
    value: ratio(adultDeaths.length, adultsAtRisk.length, true),
    unit: "%",
    numerator: adultDeaths.length,
    denominator: adultsAtRisk.length,
    formula: "Mortes de matrizes, reprodutores e descartes ÷ adultos presentes no período × 100",
    notes: [],
  };
  return {
    general,
    adult,
    causes: [...causes.entries()].map(([cause, count]) => ({ cause, count })).sort((a, b) => b.count - a.count),
  };
}

export function preWeaningMortality(
  animals: AnimalRec[],
  births: BirthRec[],
  weanings: WeaningRec[],
  exits: ExitRec[],
  p: Period,
): Indicator {
  const periodBirths = births.filter((b) => inPeriod(b.date, p));
  const bornAlive = periodBirths.reduce((s, b) => s + b.bornAlive, 0);
  const stillborn = periodBirths.reduce((s, b) => s + b.bornDead, 0);
  const lambs = lambsOfBirths(animals, periodBirths);
  const weanedAt = new Map(weanings.map((w) => [w.animalId, w.date]));
  const deathAt = new Map(exits.filter((e) => e.type === "morte").map((e) => [e.animalId, e.date]));
  let died = 0;
  for (const l of lambs) {
    const d = deathAt.get(l.id);
    if (!d) continue;
    const w = weanedAt.get(l.id);
    if (!w || d < w) died++;
  }
  const notes = [`Natimortos no período (não incluídos): ${stillborn}.`];
  const registered = lambs.length;
  if (registered < bornAlive)
    notes.push(`${bornAlive - registered} cria(s) nascida(s) viva(s) sem brinco cadastrado — não é possível saber se morreram.`);
  return {
    key: "mortalidade_cordeiros",
    label: "Mortalidade de cordeiros até o desmame",
    value: ratio(died, bornAlive, true),
    unit: "%",
    numerator: died,
    denominator: bornAlive,
    formula: "Crias nascidas vivas no período que morreram antes do desmame ÷ crias nascidas vivas × 100",
    notes,
  };
}

export function weaningRate(animals: AnimalRec[], births: BirthRec[], weanings: WeaningRec[], p: Period): Indicator {
  const periodBirths = births.filter((b) => inPeriod(b.date, p));
  const bornAlive = periodBirths.reduce((s, b) => s + b.bornAlive, 0);
  const lambs = new Set(lambsOfBirths(animals, periodBirths).map((a) => a.id));
  const weaned = weanings.filter((w) => lambs.has(w.animalId)).length;
  return {
    key: "desmame",
    label: "Taxa de desmame",
    value: ratio(weaned, bornAlive, true),
    unit: "%",
    numerator: weaned,
    denominator: bornAlive,
    formula: "Crias desmamadas (dos partos do período) ÷ crias nascidas vivas no período × 100",
    notes: ["Crias ainda em aleitamento reduzem a taxa até serem desmamadas."],
  };
}

export function averageWeaningWeight(weanings: WeaningRec[], p: Period): Indicator {
  const list = weanings.filter((w) => inPeriod(w.date, p) && w.weightG !== null);
  const sum = list.reduce((s, w) => s + (w.weightG ?? 0), 0);
  return {
    key: "peso_desmame",
    label: "Peso médio ao desmame",
    value: list.length ? sum / list.length / 1000 : null,
    unit: "kg",
    numerator: Math.round(sum / 10) / 100,
    denominator: list.length,
    formula: "Soma dos pesos ao desmame (kg) ÷ número de crias desmamadas pesadas no período",
    notes: [],
  };
}

// ---------------------------------------------------------------- Matrizes

export interface EweStats {
  eweId: number;
  tag: string;
  births: number;
  lambsBorn: number;
  lambsBornAlive: number;
  lambsWeaned: number;
  weanedKg: number;
  avgInterval: number | null;
  intervals: number[];
  lastBirth: string | null;
  firstBirth: string | null;
  prolificacy: number | null;
  birthsPerYear: number | null;
  lambsDiedPreWeaning: number;
}

export function eweStats(
  ewe: AnimalRec,
  allAnimals: AnimalRec[],
  births: BirthRec[],
  weanings: WeaningRec[],
  exits: ExitRec[],
  refDate: string,
): EweStats {
  const own = births.filter((b) => b.eweId === ewe.id).sort((a, b) => a.date.localeCompare(b.date));
  const dates = own.map((b) => b.date);
  const intervals: number[] = [];
  for (let i = 1; i < dates.length; i++) intervals.push(diffDays(dates[i - 1], dates[i]));
  const lambs = lambsOfBirths(allAnimals, own);
  const wean = new Map(weanings.map((w) => [w.animalId, w]));
  const deathAt = new Map(exits.filter((e) => e.type === "morte").map((e) => [e.animalId, e.date]));
  let weaned = 0;
  let weanedG = 0;
  let died = 0;
  for (const l of lambs) {
    const w = wean.get(l.id);
    if (w) {
      weaned++;
      weanedG += w.weightG ?? 0;
    }
    const d = deathAt.get(l.id);
    if (d && (!w || d < w.date)) died++;
  }
  const lambsBorn = own.reduce((s, b) => s + b.bornAlive + b.bornDead, 0);
  // anos observados: do primeiro registro (entrada no sistema ou 1º parto) até a referência/saída
  const obsStart = dates[0] && dates[0] < ewe.entryDate ? dates[0] : ewe.entryDate;
  const obsEnd = ewe.exitDate ? minIso(ewe.exitDate, refDate) : refDate;
  const years = diffDays(obsStart, obsEnd) / 365;
  return {
    eweId: ewe.id,
    tag: ewe.tag,
    births: own.length,
    lambsBorn,
    lambsBornAlive: own.reduce((s, b) => s + b.bornAlive, 0),
    lambsWeaned: weaned,
    weanedKg: weanedG / 1000,
    avgInterval: intervals.length ? intervals.reduce((s, v) => s + v, 0) / intervals.length : null,
    intervals,
    lastBirth: dates[dates.length - 1] ?? null,
    firstBirth: dates[0] ?? null,
    prolificacy: own.length ? lambsBorn / own.length : null,
    birthsPerYear: years >= 0.5 ? own.length / years : null,
    lambsDiedPreWeaning: died,
  };
}

export const UNPRODUCTIVE_RULES = {
  maxDaysWithoutBirth: 365,
  maxAvgInterval: 365,
  minEmptyChecks: 2,
};

export interface UnproductiveCandidate {
  eweId: number;
  tag: string;
  reasons: string[];
}

/** Matrizes ativas candidatas a descarte, com os motivos. */
export function unproductiveEwes(
  ewes: AnimalRec[],
  stats: Map<number, EweStats>,
  pregnancies: PregnancyRec[],
  refDate: string,
  rules = UNPRODUCTIVE_RULES,
): UnproductiveCandidate[] {
  const out: UnproductiveCandidate[] = [];
  for (const e of ewes) {
    if (e.status !== "ativo" || e.sex !== "F") continue;
    const cat = categoryAt(e, refDate);
    if (cat !== "matriz" && cat !== "descarte") continue;
    const s = stats.get(e.id);
    const reasons: string[] = [];
    if (cat === "descarte") reasons.push("Já classificada como descarte");
    // início da vida reprodutiva no sistema: data em que virou matriz (ou a entrada)
    const hist = e.categoryHistory?.length ? e.categoryHistory : [{ date: e.entryDate, category: e.category }];
    const becameEwe = [...hist].sort((x, y) => x.date.localeCompare(y.date)).find((h) => h.category === "matriz")?.date ?? e.entryDate;
    const lastPreg = pregnancies
      .filter((p) => p.eweId === e.id && p.date <= refDate && (!s?.lastBirth || p.date > s.lastBirth))
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const pregnantNow = lastPreg?.result === "prenhe" && diffDays(lastPreg.date, refDate) <= GESTATION_DAYS;
    if (!pregnantNow) {
      if (s?.lastBirth) {
        const d = diffDays(s.lastBirth, refDate);
        if (d > rules.maxDaysWithoutBirth) reasons.push(`Sem parto há ${d} dias`);
      } else {
        const d = diffDays(maxIso(becameEwe, e.entryDate), refDate);
        if (d > rules.maxDaysWithoutBirth) reasons.push(`Nenhum parto registrado em ${d} dias como matriz`);
      }
    }
    if (s?.avgInterval && s.avgInterval > rules.maxAvgInterval)
      reasons.push(`Intervalo médio entre partos de ${Math.round(s.avgInterval)} dias`);
    const after = s?.lastBirth ?? "0000-00-00";
    const empties = pregnancies.filter((p) => p.eweId === e.id && p.result === "vazia" && p.date > after).length;
    if (empties >= rules.minEmptyChecks) reasons.push(`${empties} diagnósticos de gestação vazios desde o último parto`);
    if (s && s.lambsBornAlive >= 2 && s.lambsDiedPreWeaning / s.lambsBornAlive >= 0.5)
      reasons.push(`Perdeu ${s.lambsDiedPreWeaning} de ${s.lambsBornAlive} crias antes do desmame`);
    if (reasons.length) out.push({ eweId: e.id, tag: e.tag, reasons });
  }
  return out;
}

/** Ordena matrizes: mais crias desmamadas, depois mais partos, depois menor intervalo. */
export function rankEwes(stats: EweStats[]): EweStats[] {
  return [...stats].sort(
    (a, b) =>
      b.lambsWeaned - a.lambsWeaned ||
      b.births - a.births ||
      (a.avgInterval ?? Infinity) - (b.avgInterval ?? Infinity) ||
      a.tag.localeCompare(b.tag, "pt-BR", { numeric: true }),
  );
}

/** Previsão de parto a partir da cobertura. */
export function expectedBirthDate(breedingDate: string): string {
  return addDays(breedingDate, GESTATION_DAYS);
}

// ---------------------------------------------------------------- Custos

export function costPerHead(expenseCents: number, animals: AnimalRec[], p: Period): Indicator {
  const avg = averageHeadcount(animals, p);
  return {
    key: "custo_cabeca",
    label: "Custo por cabeça",
    value: avg > 0 ? expenseCents / avg : null,
    unit: "centavos",
    numerator: expenseCents,
    denominator: Math.round(avg * 10) / 10,
    formula: "Despesas do período ÷ efetivo médio do período (dias-animal ÷ dias do período)",
    notes: [],
  };
}
