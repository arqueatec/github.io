import { describe, expect, it } from "vitest";
import {
  buildLedger,
  describeBalance,
  finalBalance,
  partyTotals,
  shareAt,
  shareFromPercent,
  splitAmount,
  type LedgerInput,
  type Share,
} from "@/domain/ledger";

const THIRD: Share[] = [{ validFrom: "2020-01-01", num: 1, den: 3 }];
let seq = 1;
const e = (kind: LedgerInput["kind"], party: "A" | "B", amountCents: number, date = "2025-01-10"): LedgerInput => ({
  kind,
  party,
  amountCents,
  date,
  id: seq++,
});

describe("rateio 1/3 – 2/3", () => {
  it("divide exatamente e A + B = total", () => {
    for (const total of [1, 2, 3, 100, 101, 102, 30000, 99999, 123457]) {
      const s = splitAmount(total, { num: 1, den: 3 });
      expect(s.A + s.B).toBe(total);
      expect(Math.abs(s.A * 3 - total)).toBeLessThanOrEqual(2);
    }
  });
  it("R$ 300,00 → A R$ 100,00 e B R$ 200,00", () => {
    expect(splitAmount(30000, { num: 1, den: 3 })).toEqual({ A: 10000, B: 20000 });
  });
  it("R$ 1,00 → A R$ 0,33 e B R$ 0,67", () => {
    expect(splitAmount(100, { num: 1, den: 3 })).toEqual({ A: 33, B: 67 });
  });
  it("percentual configurável → fração reduzida", () => {
    expect(shareFromPercent(50)).toEqual({ num: 1, den: 2 });
    expect(shareFromPercent(25)).toEqual({ num: 1, den: 4 });
  });
});

describe("vigência dos percentuais", () => {
  const shares: Share[] = [
    { validFrom: "2024-01-01", num: 1, den: 3 },
    { validFrom: "2025-07-01", num: 1, den: 2 },
  ];
  it("usa a configuração vigente na data do lançamento", () => {
    expect(shareAt(shares, "2025-06-30")).toMatchObject({ num: 1, den: 3 });
    expect(shareAt(shares, "2025-07-01")).toMatchObject({ num: 1, den: 2 });
    expect(shareAt(shares, "2023-05-01")).toMatchObject({ num: 1, den: 3 });
  });
  it("lançamentos antigos mantêm o rateio antigo", () => {
    const lines = buildLedger([e("despesa", "A", 30000, "2025-06-01"), e("despesa", "A", 30000, "2025-08-01")], shares);
    expect(lines.map((l) => l.effect)).toEqual([20000, 15000]);
  });
  it("padrão 1/3 quando não há configuração", () => {
    expect(shareAt([], "2025-01-01")).toMatchObject({ num: 1, den: 3 });
  });
});

describe("saldo entre as partes (positivo = B deve a A)", () => {
  it("A paga R$ 300 → B deve R$ 200", () => {
    const b = finalBalance([e("despesa", "A", 30000)], THIRD);
    expect(b).toBe(20000);
    expect(describeBalance(b)).toEqual({ debtor: "B", creditor: "A", amountCents: 20000 });
  });
  it("B paga R$ 300 → A deve R$ 100", () => {
    const b = finalBalance([e("despesa", "B", 30000)], THIRD);
    expect(b).toBe(-10000);
    expect(describeBalance(b)).toEqual({ debtor: "A", creditor: "B", amountCents: 10000 });
  });
  it("receita recebida por A (R$ 300) → A deve R$ 200 a B", () => {
    expect(finalBalance([e("receita", "A", 30000)], THIRD)).toBe(-20000);
  });
  it("receita recebida por B (R$ 300) → B deve R$ 100 a A", () => {
    expect(finalBalance([e("receita", "B", 30000)], THIRD)).toBe(10000);
  });

  it("compensação: despesas dos dois lados abatem automaticamente", () => {
    // A paga 300 (B deve 200); B paga 600 (A deve 200) → zerado
    const b = finalBalance([e("despesa", "A", 30000), e("despesa", "B", 60000)], THIRD);
    expect(b).toBe(0);
    expect(describeBalance(b).debtor).toBeNull();
  });
  it("compensação parcial", () => {
    // A paga 900 (B deve 600); B paga 300 (A deve 100) → B deve 500
    expect(finalBalance([e("despesa", "A", 90000), e("despesa", "B", 30000)], THIRD)).toBe(50000);
  });

  it("reembolso quita o saldo restante", () => {
    const entries = [e("despesa", "A", 90000), e("despesa", "B", 30000), e("reembolso", "B", 50000, "2025-01-20")];
    const lines = buildLedger(entries, THIRD);
    expect(lines.map((l) => l.balance)).toEqual([60000, 50000, 0]);
    expect(lines[2].effect).toBe(-50000);
  });
  it("reembolso de A para B aumenta o saldo (reduz a dívida de A)", () => {
    expect(finalBalance([e("despesa", "B", 30000), e("reembolso", "A", 10000, "2025-02-01")], THIRD)).toBe(0);
  });
  it("reembolso maior que a dívida inverte o devedor", () => {
    expect(finalBalance([e("despesa", "A", 30000), e("reembolso", "B", 25000, "2025-02-01")], THIRD)).toBe(-5000);
  });

  it("arredondamento de centavos: cada lançamento é dividido exatamente", () => {
    // 3 despesas de R$ 1,00 pagas por A → B deve 0,67 × 3 = 2,01
    const b = finalBalance([e("despesa", "A", 100), e("despesa", "A", 100), e("despesa", "A", 100)], THIRD);
    expect(b).toBe(201);
    // B paga R$ 1,00 três vezes → A deve 0,33 × 3 = 0,99
    expect(finalBalance([e("despesa", "B", 100), e("despesa", "B", 100), e("despesa", "B", 100)], THIRD)).toBe(-99);
    // R$ 0,01 pago por B → fração de A arredonda para 0
    expect(finalBalance([e("despesa", "B", 1)], THIRD)).toBe(0);
    expect(finalBalance([e("despesa", "A", 1)], THIRD)).toBe(1);
  });

  it("extrato ordenado por data com saldo acumulado", () => {
    const lines = buildLedger(
      [e("despesa", "B", 30000, "2025-03-01"), e("despesa", "A", 30000, "2025-01-01"), e("receita", "B", 60000, "2025-02-01")],
      THIRD,
    );
    expect(lines.map((l) => l.date)).toEqual(["2025-01-01", "2025-02-01", "2025-03-01"]);
    expect(lines.map((l) => l.balance)).toEqual([20000, 40000, 30000]);
  });

  it("cenário completo: totais por parte e resultado", () => {
    const entries = [
      e("despesa", "A", 30000),
      e("despesa", "B", 60000),
      e("receita", "B", 90000),
      e("reembolso", "B", 10000),
    ];
    const t = partyTotals(entries, THIRD);
    expect(t.paid).toEqual({ A: 30000, B: 60000 });
    expect(t.received).toEqual({ A: 0, B: 90000 });
    expect(t.expenseShare).toEqual({ A: 30000, B: 60000 });
    expect(t.revenueShare).toEqual({ A: 30000, B: 60000 });
    expect(t.result).toEqual({ A: 0, B: 0 });
    // A pagou 300 (+200), B pagou 600 (−200), B recebeu 900 (+300), B reembolsou 100 (−100) → 200
    expect(finalBalance(entries, THIRD)).toBe(20000);
  });
});
