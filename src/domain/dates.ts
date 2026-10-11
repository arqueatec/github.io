/** Datas de negócio como string ISO "YYYY-MM-DD", calculadas em UTC para evitar fuso. */

const DAY = 86_400_000;

export function toDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = toDate(s);
  return !Number.isNaN(d.getTime()) && toIso(d) === s;
}

export function addDays(iso: string, days: number): string {
  return toIso(new Date(toDate(iso).getTime() + days * DAY));
}

export function addMonths(iso: string, months: number): string {
  const d = toDate(iso);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return toIso(target);
}

/** Diferença em dias (b − a). */
export function diffDays(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY);
}

export function minIso(a: string, b: string) {
  return a < b ? a : b;
}
export function maxIso(a: string, b: string) {
  return a > b ? a : b;
}

/** Hoje no fuso de São Paulo (as datas de manejo são locais). */
export function todayIso(timeZone = "America/Sao_Paulo"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}

export function endOfMonth(iso: string): string {
  const d = toDate(iso);
  return toIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Idade legível a partir da data de nascimento. */
export function ageLabel(birthIso: string | null | undefined, refIso: string, estimated = false): string {
  if (!birthIso) return "desconhecida";
  const days = diffDays(birthIso, refIso);
  if (days < 0) return "—";
  const prefix = estimated ? "~" : "";
  if (days < 60) return `${prefix}${days} dias`;
  const months = Math.floor(days / 30.4375);
  if (months < 24) return `${prefix}${months} meses`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return `${prefix}${years} ano${years > 1 ? "s" : ""}${rem ? ` e ${rem} m` : ""}`;
}

/** Data de nascimento estimada a partir da idade (meses) na data de referência. */
export function birthFromAgeMonths(ageMonths: number, refIso: string): string {
  return addDays(refIso, -Math.round(ageMonths * 30.4375));
}
