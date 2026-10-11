import { describe, expect, it } from "vitest";
import { formatCents, mulFrac, parseKgToGrams, parseMoneyToCents } from "@/domain/money";

describe("parseMoneyToCents", () => {
  it.each([
    ["300", 30000],
    ["300,00", 30000],
    ["1.234,56", 123456],
    ["1234.56", 123456],
    ["1,5", 150],
    ["R$ 2.000", 200000],
    ["0,01", 1],
    ["1.000.000", 100000000],
  ])("%s → %d", (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected);
  });
  it.each(["", "abc", "1,234,5", "1,234"])("rejeita %s", (input) => {
    expect(parseMoneyToCents(input)).toBeNull();
  });
});

describe("mulFrac (arredondamento meio-para-cima, só inteiros)", () => {
  it("divide por terços", () => {
    expect(mulFrac(30000, 1, 3)).toBe(10000);
    expect(mulFrac(100, 1, 3)).toBe(33); // 33,33
    expect(mulFrac(200, 1, 3)).toBe(67); // 66,67
    expect(mulFrac(1, 1, 3)).toBe(0); // 0,33
    expect(mulFrac(2, 1, 3)).toBe(1); // 0,67
    expect(mulFrac(150, 1, 2)).toBe(75);
    expect(mulFrac(1, 1, 2)).toBe(1); // 0,5 → 1 (half-up)
  });
  it("trata negativos simetricamente", () => {
    expect(mulFrac(-100, 1, 3)).toBe(-33);
  });
  it("rejeita não inteiros", () => {
    expect(() => mulFrac(1.5, 1, 3)).toThrow();
  });
});

describe("formatação", () => {
  it("formata BRL", () => {
    expect(formatCents(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
  });
  it("kg → g", () => {
    expect(parseKgToGrams("32,5")).toBe(32500);
    expect(parseKgToGrams("")).toBeNull();
  });
});
