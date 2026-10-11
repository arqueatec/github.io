/**
 * Rateio e acerto de contas entre as duas partes.
 *
 * Convenção do saldo: `saldo` = quanto a Parte B deve à Parte A, em centavos.
 *   saldo > 0  → B deve a A
 *   saldo < 0  → A deve a B
 *   saldo = 0  → contas acertadas
 *
 * Regras (exemplo com A = 1/3, B = 2/3):
 *   Despesa paga por A (R$ 300)  → B deve a fração de B (R$ 200): saldo += 200
 *   Despesa paga por B (R$ 300)  → A deve a fração de A (R$ 100): saldo −= 100
 *   Receita recebida por A (R$ 300) → A deve a fração de B (R$ 200): saldo −= 200
 *   Receita recebida por B (R$ 300) → B deve a fração de A (R$ 100): saldo += 100
 *   Reembolso de B para A (R$ X) → saldo −= X ;  de A para B → saldo += X
 *
 * Arredondamento: a fração de A de cada lançamento é arredondada meio-para-cima ao centavo,
 * e a fração de B é sempre o complemento (total − A). Assim, cada lançamento é dividido
 * exatamente, sem centavos "sumindo" ou "sobrando".
 */
import { mulFrac } from "./money";

export type Party = "A" | "B";

export interface Share {
  /** Data inicial de vigência (YYYY-MM-DD). */
  validFrom: string;
  num: number;
  den: number;
}

export const DEFAULT_SHARE: Share = { validFrom: "1900-01-01", num: 1, den: 3 };

export function otherParty(p: Party): Party {
  return p === "A" ? "B" : "A";
}

/** Retorna a configuração de participação vigente em `date`. */
export function shareAt(shares: Share[], date: string): Share {
  let best: Share | undefined;
  for (const s of shares) {
    if (s.validFrom <= date && (!best || s.validFrom > best.validFrom)) best = s;
  }
  if (!best) {
    // Antes da primeira vigência cadastrada usa-se a mais antiga (ou o padrão 1/3).
    best = [...shares].sort((a, b) => a.validFrom.localeCompare(b.validFrom))[0] ?? DEFAULT_SHARE;
  }
  return best;
}

export interface Split {
  A: number;
  B: number;
}

/** Divide um valor entre as partes conforme a fração de A. A + B === total sempre. */
export function splitAmount(totalCents: number, share: Pick<Share, "num" | "den">): Split {
  const A = mulFrac(totalCents, share.num, share.den);
  return { A, B: totalCents - A };
}

export type LedgerEntryKind = "despesa" | "receita" | "reembolso";

export interface LedgerInput {
  kind: LedgerEntryKind;
  id: number;
  date: string;
  amountCents: number;
  /** despesa: parte que pagou; receita: parte que recebeu; reembolso: parte que pagou o reembolso. */
  party: Party;
  description?: string | null;
  userName?: string | null;
  categoryName?: string | null;
  createdAt?: string | Date;
}

export interface LedgerLine extends LedgerInput {
  shareA: number;
  shareB: number;
  /** Efeito no saldo (positivo aumenta o que B deve a A). */
  effect: number;
  /** Saldo acumulado após este lançamento. */
  balance: number;
}

/** Efeito de um lançamento no saldo (B deve a A). */
export function entryEffect(e: Pick<LedgerInput, "kind" | "amountCents" | "party">, share: Split): number {
  switch (e.kind) {
    case "despesa":
      return e.party === "A" ? share.B : -share.A;
    case "receita":
      return e.party === "A" ? -share.B : share.A;
    case "reembolso":
      return e.party === "B" ? -e.amountCents : e.amountCents;
  }
}

const kindOrder: Record<LedgerEntryKind, number> = { despesa: 0, receita: 1, reembolso: 2 };

function compareEntries(a: LedgerInput, b: LedgerInput): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  if (ca !== cb) return ca - cb;
  if (a.kind !== b.kind) return kindOrder[a.kind] - kindOrder[b.kind];
  return a.id - b.id;
}

/** Gera o extrato ordenado com o efeito de cada lançamento e o saldo acumulado. */
export function buildLedger(entries: LedgerInput[], shares: Share[], openingBalance = 0): LedgerLine[] {
  const sorted = [...entries].sort(compareEntries);
  let balance = openingBalance;
  return sorted.map((e) => {
    const split = e.kind === "reembolso" ? { A: 0, B: 0 } : splitAmount(e.amountCents, shareAt(shares, e.date));
    const effect = entryEffect(e, split);
    balance += effect;
    return { ...e, shareA: split.A, shareB: split.B, effect, balance };
  });
}

export function finalBalance(entries: LedgerInput[], shares: Share[]): number {
  const lines = buildLedger(entries, shares);
  return lines.length ? lines[lines.length - 1].balance : 0;
}

export interface BalanceDescription {
  debtor: Party | null;
  creditor: Party | null;
  amountCents: number;
}

export function describeBalance(balance: number): BalanceDescription {
  if (balance === 0) return { debtor: null, creditor: null, amountCents: 0 };
  return balance > 0
    ? { debtor: "B", creditor: "A", amountCents: balance }
    : { debtor: "A", creditor: "B", amountCents: -balance };
}

/** Totais por parte num conjunto de lançamentos (sem reembolsos). */
export function partyTotals(entries: LedgerInput[], shares: Share[]) {
  const t = {
    paid: { A: 0, B: 0 },
    received: { A: 0, B: 0 },
    expenseShare: { A: 0, B: 0 },
    revenueShare: { A: 0, B: 0 },
    reimbursed: { A: 0, B: 0 },
  };
  for (const e of entries) {
    if (e.kind === "reembolso") {
      t.reimbursed[e.party] += e.amountCents;
      continue;
    }
    const s = splitAmount(e.amountCents, shareAt(shares, e.date));
    if (e.kind === "despesa") {
      t.paid[e.party] += e.amountCents;
      t.expenseShare.A += s.A;
      t.expenseShare.B += s.B;
    } else {
      t.received[e.party] += e.amountCents;
      t.revenueShare.A += s.A;
      t.revenueShare.B += s.B;
    }
  }
  return {
    ...t,
    result: { A: t.revenueShare.A - t.expenseShare.A, B: t.revenueShare.B - t.expenseShare.B },
  };
}

/** Valida e normaliza uma participação informada como percentual (ex.: 33.3333) ou fração. */
export function shareFromPercent(percentA: number): { num: number; den: number } {
  if (!Number.isFinite(percentA) || percentA < 0 || percentA > 100) throw new Error("Percentual inválido");
  const den = 1_000_000;
  return reduce(Math.round(percentA * 10_000), den);
}

export function reduce(num: number, den: number) {
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

export function shareLabel(s: Pick<Share, "num" | "den">): { A: string; B: string } {
  const pa = (s.num / s.den) * 100;
  const fmt = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  return { A: `${s.num}/${s.den} (${fmt(pa)})`, B: `${s.den - s.num}/${s.den} (${fmt(100 - pa)})` };
}
