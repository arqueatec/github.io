/** Utilitários monetários. Todos os valores trafegam como centavos inteiros. */

export function assertCents(v: number): number {
  if (!Number.isSafeInteger(v)) throw new Error(`Valor monetário inválido (não inteiro): ${v}`);
  return v;
}

/** Converte "1.234,56", "1234.56", "1234,5" ou número em centavos. Retorna null se inválido. */
export function parseMoneyToCents(input: string | number): number | null {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    return Math.round(input * 100);
  }
  let s = input.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!s) return null;
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  let intPart: string;
  let decPart = "";
  if (s.includes(",")) {
    // formato brasileiro: ponto = milhar, vírgula = decimal
    const [i, d = "", ...rest] = s.split(",");
    if (rest.length) return null;
    intPart = i;
    decPart = d;
  } else {
    const parts = s.split(".");
    if (parts.length === 2 && parts[1].length <= 2) {
      intPart = parts[0];
      decPart = parts[1];
    } else {
      intPart = s;
    }
  }
  if (decPart.length > 2) return null;
  intPart = intPart.replace(/[.,]/g, "");
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(decPart)) return null;
  if (!intPart && !decPart) return null;
  const cents = Number(intPart || "0") * 100 + Number((decPart + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents)) return null;
  return neg ? -cents : cents;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatCents(cents: number): string {
  return brl.format(cents / 100);
}

/** "1234,56" para preencher campos de edição. */
export function centsToInput(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  return `${neg ? "-" : ""}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Multiplica centavos por uma fração arredondando "meio para cima" (half-up) de forma
 * exata em inteiros, sem ponto flutuante. Ex.: 100 × 1/3 = 33; 200 × 1/3 = 67 (66,67).
 */
export function mulFrac(cents: number, num: number, den: number): number {
  assertCents(cents);
  if (den <= 0) throw new Error("Denominador inválido");
  const sign = cents < 0 ? -1 : 1;
  const abs = Math.abs(cents) * num;
  const q = Math.floor(abs / den);
  const r = abs - q * den;
  return sign * (2 * r >= den ? q + 1 : q);
}

export function parseKgToGrams(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || input === "") return null;
  const n = typeof input === "number" ? input : Number(String(input).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1000);
}

export function formatKg(grams: number | null | undefined, digits = 1): string {
  if (grams === null || grams === undefined) return "—";
  return `${(grams / 1000).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} kg`;
}
