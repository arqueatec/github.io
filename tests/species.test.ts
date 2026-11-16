import { describe, expect, it } from "vitest";
import {
  categoriesFor,
  categoriesForSex,
  gestationFor,
  isAdultCategory,
  speciesOfCategory,
  validCategoryForSex,
  SPECIES_CONFIG,
} from "@/domain/species";
import { birthRate, expectedBirthDate, herdByCategory, lambingRate, type AnimalRec, type BirthRec, type BreedingRec } from "@/domain/indices";

describe("configuração de espécie", () => {
  it("gestação por espécie", () => {
    expect(gestationFor("ovino")).toBe(150);
    expect(gestationFor("bovino")).toBe(285);
  });
  it("categorias por espécie", () => {
    expect(categoriesFor("ovino")).toContain("matriz");
    expect(categoriesFor("ovino")).not.toContain("vaca");
    expect(categoriesFor("bovino")).toEqual(["vaca", "touro", "bezerro", "novilho", "garrote", "boi", "descarte"]);
  });
  it("categorias por sexo removem a do sexo oposto", () => {
    expect(categoriesForSex("bovino", "F")).not.toContain("touro");
    expect(categoriesForSex("bovino", "M")).not.toContain("vaca");
    expect(categoriesForSex("ovino", "M")).not.toContain("matriz");
  });
  it("validação categoria × sexo", () => {
    expect(validCategoryForSex("bovino", "vaca", "F")).toBe(true);
    expect(validCategoryForSex("bovino", "vaca", "M")).toBe(false);
    expect(validCategoryForSex("bovino", "touro", "F")).toBe(false);
    expect(validCategoryForSex("ovino", "matriz", "M")).toBe(false);
  });
  it("adulto por espécie", () => {
    expect(isAdultCategory("bovino", "vaca")).toBe(true);
    expect(isAdultCategory("bovino", "boi")).toBe(true);
    expect(isAdultCategory("bovino", "bezerro")).toBe(false);
    expect(isAdultCategory("ovino", "borrego")).toBe(false);
  });
  it("promoção: cria e desmamado", () => {
    expect(SPECIES_CONFIG.bovino.young).toBe("bezerro");
    expect(SPECIES_CONFIG.bovino.weaned).toBe("novilho");
    expect(SPECIES_CONFIG.ovino.femaleAdult).toBe("matriz");
  });
  it("espécie a partir da categoria", () => {
    expect(speciesOfCategory("vaca")).toBe("bovino");
    expect(speciesOfCategory("cordeiro")).toBe("ovino");
    expect(speciesOfCategory("descarte")).toBe("ovino");
  });
});

describe("índices com gestação bovina", () => {
  const vaca = (id: number): AnimalRec => ({
    id,
    tag: `V${id}`,
    species: "bovino",
    sex: "F",
    category: "vaca",
    status: "ativo",
    birthDate: null,
    entryDate: "2024-01-01",
    exitDate: null,
    motherId: null,
    birthId: null,
    lotId: null,
  });
  const P = { start: "2025-01-01", end: "2025-12-31" };
  it("previsão de parto bovina = cobertura + 285 dias", () => {
    expect(expectedBirthDate("2025-01-01", 285)).toBe("2025-10-13");
  });
  it("natalidade/parição usam a gestação informada para expostas", () => {
    // cobertura em 2024-06-01 → parto previsto 2025-03-13 (285 d), dentro do período
    const breedings: BreedingRec[] = [{ id: 1, eweId: 1, date: "2024-06-01" }];
    const births: BirthRec[] = [{ id: 1, eweId: 1, date: "2025-03-10", bornAlive: 1, bornDead: 0 }];
    expect(birthRate(breedings, births, P, 285).denominator).toBe(1);
    expect(lambingRate(breedings, births, P, 285).value).toBe(100);
    // com gestação de 150 d a previsão cairia em 2024-10-29, fora do período → só entra pela parição
    expect(birthRate([{ id: 1, eweId: 1, date: "2024-06-01" }], [], P, 150).denominator).toBe(0);
  });
  it("efetivo por categoria conta categorias bovinas", () => {
    const h = herdByCategory([vaca(1), vaca(2), { ...vaca(3), category: "bezerro", sex: "M" }], "2025-06-01");
    expect(h.vaca).toBe(2);
    expect(h.bezerro).toBe(1);
    expect(h.total).toBe(3);
    expect(h.matriz).toBe(0);
  });
});
