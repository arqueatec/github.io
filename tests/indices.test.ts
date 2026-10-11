import { describe, expect, it } from "vitest";
import {
  animalDays,
  averageHeadcount,
  averageWeaningWeight,
  birthRate,
  birthsPerEwePerYear,
  categoryAt,
  costPerHead,
  eweStats,
  expectedBirthDate,
  exposedEwes,
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
  type BreedingRec,
  type ExitRec,
  type WeaningRec,
} from "@/domain/indices";

const P = { start: "2025-01-01", end: "2025-12-31" };

function animal(id: number, over: Partial<AnimalRec> = {}): AnimalRec {
  return {
    id,
    tag: String(id),
    sex: "F",
    category: "matriz",
    status: "ativo",
    birthDate: null,
    entryDate: "2024-01-01",
    exitDate: null,
    motherId: null,
    birthId: null,
    lotId: null,
    ...over,
  };
}

// 4 matrizes expostas (coberturas com previsão de parto em 2025), 3 paridas
const ewes = [animal(1), animal(2), animal(3), animal(4)];
const breedings: BreedingRec[] = [
  { id: 1, eweId: 1, date: "2024-10-01" }, // parto previsto 2025-02-28
  { id: 2, eweId: 2, date: "2024-10-01" },
  { id: 3, eweId: 3, date: "2024-10-05" },
  { id: 4, eweId: 4, date: "2024-10-05" },
  { id: 5, eweId: 1, date: "2025-09-01" }, // previsto 2026-01-29 → fora do período
];
const births: BirthRec[] = [
  { id: 10, eweId: 1, date: "2024-03-01", bornAlive: 1, bornDead: 0 }, // parto anterior (2024)
  { id: 11, eweId: 1, date: "2025-03-01", bornAlive: 2, bornDead: 0 },
  { id: 12, eweId: 2, date: "2025-03-03", bornAlive: 1, bornDead: 1 },
  { id: 13, eweId: 3, date: "2025-03-05", bornAlive: 1, bornDead: 0 },
];
// crias cadastradas dos partos de 2025
const lambs = [
  animal(101, { birthId: 11, motherId: 1, category: "cordeiro", birthDate: "2025-03-01", entryDate: "2025-03-01" }),
  animal(102, { birthId: 11, motherId: 1, category: "cordeiro", birthDate: "2025-03-01", entryDate: "2025-03-01" }),
  animal(103, { birthId: 12, motherId: 2, category: "cordeiro", birthDate: "2025-03-03", entryDate: "2025-03-03", exitDate: "2025-04-01", status: "morto" }),
  animal(104, { birthId: 13, motherId: 3, category: "cordeiro", birthDate: "2025-03-05", entryDate: "2025-03-05" }),
];
const weanings: WeaningRec[] = [
  { animalId: 101, date: "2025-06-01", weightG: 20000 },
  { animalId: 102, date: "2025-06-01", weightG: 18000 },
  { animalId: 104, date: "2025-06-05", weightG: 22000 },
];
const exits: ExitRec[] = [{ animalId: 103, type: "morte", date: "2025-04-01", cause: "Pneumonia" }];
const all = [...ewes, ...lambs];

describe("reprodução", () => {
  it("matrizes expostas pela previsão de parto", () => {
    expect([...exposedEwes(breedings, births, P)].sort()).toEqual([1, 2, 3, 4]);
  });
  it("natalidade = nascidas / expostas", () => {
    const r = birthRate(breedings, births, P);
    expect(r.numerator).toBe(5); // 2 + 2 + 1
    expect(r.denominator).toBe(4);
    expect(r.value).toBeCloseTo(125);
    expect(r.formula).toMatch(/matrizes expostas/);
  });
  it("parição = paridas / expostas", () => {
    const r = lambingRate(breedings, births, P);
    expect(r.numerator).toBe(3);
    expect(r.value).toBeCloseTo(75);
  });
  it("prolificidade = crias / partos", () => {
    const r = prolificacy(births, P);
    expect(r.value).toBeCloseTo(5 / 3);
  });
  it("matriz que pariu sem cobertura registrada conta como exposta", () => {
    const r = lambingRate([], births, P);
    expect(r.denominator).toBe(3);
    expect(r.notes.join(" ")).toMatch(/não é confiável/);
  });
  it("divisão por zero vira null", () => {
    expect(prolificacy([], P).value).toBeNull();
    expect(birthRate([], [], P).value).toBeNull();
  });
  it("intervalo entre partos só a partir do 2º parto", () => {
    const r = herdBirthInterval(births, P);
    expect(r.denominator).toBe(1); // só a matriz 1 tem 2 partos
    expect(r.value).toBe(365);
    expect(r.notes.join(" ")).toMatch(/2 matriz\(es\) com apenas 1 parto/);
  });
  it("previsão de parto = cobertura + 150 dias", () => {
    expect(expectedBirthDate("2025-01-01")).toBe("2025-05-31");
  });
  it("partos por matriz por ano usa matrizes-ano", () => {
    const r = birthsPerEwePerYear(all, births, P);
    expect(r.numerator).toBe(3);
    expect(r.denominator).toBeCloseTo(4, 1); // 4 matrizes o ano todo
    expect(r.value).toBeCloseTo(0.75, 2);
  });
});

describe("mortalidade e desmame", () => {
  it("mortalidade geral com causas", () => {
    const m = mortality(all, exits, P);
    expect(m.general.numerator).toBe(1);
    expect(m.general.denominator).toBe(8);
    expect(m.general.value).toBeCloseTo(12.5);
    expect(m.causes).toEqual([{ cause: "Pneumonia", count: 1 }]);
    expect(m.adult.numerator).toBe(0);
    expect(m.adult.denominator).toBe(4);
  });
  it("mortalidade de adultos considera a categoria na morte", () => {
    const deadEwe = animal(5, { exitDate: "2025-05-01", status: "morto" });
    const m = mortality([...all, deadEwe], [...exits, { animalId: 5, type: "morte", date: "2025-05-01", cause: null }], P);
    expect(m.adult.numerator).toBe(1);
    expect(m.adult.denominator).toBe(5);
    expect(m.causes.find((c) => c.cause === "Não informada")?.count).toBe(1);
  });
  it("mortalidade até o desmame = mortas antes do desmame / nascidas vivas", () => {
    const r = preWeaningMortality(all, births, weanings, exits, P);
    expect(r.numerator).toBe(1);
    expect(r.denominator).toBe(4);
    expect(r.value).toBeCloseTo(25);
    expect(r.notes[0]).toMatch(/Natimortos.*1/);
  });
  it("taxa de desmame e peso médio", () => {
    expect(weaningRate(all, births, weanings, P).value).toBeCloseTo(75);
    expect(averageWeaningWeight(weanings, P).value).toBeCloseTo(20);
  });
});

describe("efetivo", () => {
  it("categoria no tempo segue o histórico", () => {
    const a = animal(200, {
      category: "borrego",
      entryDate: "2025-01-01",
      categoryHistory: [
        { date: "2025-01-01", category: "cordeiro" },
        { date: "2025-05-01", category: "borrego" },
      ],
    });
    expect(categoryAt(a, "2025-03-01")).toBe("cordeiro");
    expect(categoryAt(a, "2025-06-01")).toBe("borrego");
  });
  it("efetivo por categoria numa data exclui baixas", () => {
    const h = herdByCategory(all, "2025-05-01");
    expect(h.total).toBe(7);
    expect(h.matriz).toBe(4);
    expect(h.cordeiro).toBe(3);
  });
  it("evolução mensal", () => {
    const ev = herdEvolution(all, { start: "2025-01-01", end: "2025-04-30" });
    expect(ev.map((p) => p.total)).toEqual([4, 4, 8, 7]);
  });
  it("efetivo médio por dias-animal", () => {
    const p = { start: "2025-01-01", end: "2025-01-10" };
    const a = [animal(1, { entryDate: "2024-01-01" }), animal(2, { entryDate: "2025-01-06" })];
    expect(animalDays(a, p)).toBe(15);
    expect(averageHeadcount(a, p)).toBeCloseTo(1.5);
  });
  it("custo por cabeça", () => {
    const p = { start: "2025-01-01", end: "2025-01-10" };
    const a = [animal(1), animal(2)];
    const c = costPerHead(10000, a, p);
    expect(c.value).toBe(5000);
  });
});

describe("matrizes", () => {
  it("estatísticas individuais", () => {
    const s = eweStats(ewes[0], all, births, weanings, exits, "2025-12-31");
    expect(s.births).toBe(2);
    expect(s.lambsBorn).toBe(3);
    expect(s.lambsWeaned).toBe(2);
    expect(s.weanedKg).toBe(38);
    expect(s.avgInterval).toBe(365);
    expect(s.prolificacy).toBe(1.5);
  });
  it("ranking e improdutivas", () => {
    const stats = ewes.map((e) => eweStats(e, all, births, weanings, exits, "2025-12-31"));
    expect(rankEwes(stats).map((s) => s.eweId)).toEqual([1, 3, 2, 4]);
    const map = new Map(stats.map((s) => [s.eweId, s]));
    const pregs = [
      { eweId: 2, date: "2025-08-01", result: "vazia" as const },
      { eweId: 2, date: "2025-10-01", result: "vazia" as const },
    ];
    const u = unproductiveEwes(ewes, map, pregs, "2026-06-01");
    const byId = new Map(u.map((c) => [c.eweId, c.reasons.join("; ")]));
    expect(byId.get(4)).toMatch(/Nenhum parto registrado/);
    expect(byId.get(2)).toMatch(/2 diagnósticos/);
    expect(byId.get(2)).toMatch(/Sem parto há/);
    expect(byId.has(1)).toBe(true); // sem parto há > 365 dias em 2026-06-01
    expect(unproductiveEwes(ewes, map, [], "2025-12-31").map((c) => c.eweId)).toEqual([4]);
  });
});
