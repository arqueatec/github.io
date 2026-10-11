/**
 * Regras de autorização — funções puras usadas por TODAS as rotas do servidor.
 *
 *  - Administrador: gerencia usuários, participações, categorias, lotes e reabre períodos.
 *  - Sócios (inclusive o administrador): lançam e consultam tudo.
 *  - Lançamentos financeiros (despesa, receita, reembolso) só podem ser editados/excluídos
 *    por quem os criou, e nunca quando a data está em período fechado (travado).
 *  - Período fechado: ninguém cria/edita/exclui lançamento com data ≤ data do fechamento;
 *    somente o administrador reabre o período.
 */

export type Role = "admin" | "socio";

export interface Actor {
  id: number;
  role: Role;
  active: boolean;
  party: "A" | "B";
}

export interface FinancialEntryRef {
  createdBy: number;
  date: string;
  deletedAt?: Date | string | null;
}

export class AccessError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

export function isAdmin(a: Actor | null | undefined): boolean {
  return !!a && a.active && a.role === "admin";
}

export function canRead(a: Actor | null | undefined): boolean {
  return !!a && a.active;
}

/** Qualquer sócio ativo pode criar registros de rebanho, manejo e baixas. */
export function canWriteHerd(a: Actor | null | undefined): boolean {
  return !!a && a.active;
}

export function isLocked(date: string, lockedUntil: string | null): boolean {
  return !!lockedUntil && date <= lockedUntil;
}

export type Decision = { ok: true } | { ok: false; reason: string };

export function canCreateFinancial(a: Actor | null | undefined, date: string, lockedUntil: string | null): Decision {
  if (!a || !a.active) return { ok: false, reason: "Usuário não autenticado ou inativo" };
  if (isLocked(date, lockedUntil))
    return { ok: false, reason: `Período fechado até ${lockedUntil}. Peça ao administrador para reabrir.` };
  return { ok: true };
}

export function canModifyFinancial(
  a: Actor | null | undefined,
  entry: FinancialEntryRef,
  lockedUntil: string | null,
  newDate?: string,
): Decision {
  if (!a || !a.active) return { ok: false, reason: "Usuário não autenticado ou inativo" };
  if (entry.deletedAt) return { ok: false, reason: "Lançamento já excluído" };
  if (entry.createdBy !== a.id) return { ok: false, reason: "Só quem criou o lançamento pode alterá-lo ou excluí-lo" };
  if (isLocked(entry.date, lockedUntil))
    return { ok: false, reason: `Lançamento em período fechado (até ${lockedUntil}). Somente o administrador pode reabrir.` };
  if (newDate && isLocked(newDate, lockedUntil))
    return { ok: false, reason: `A nova data cai em período fechado (até ${lockedUntil}).` };
  return { ok: true };
}

export function canManageUsers(a: Actor | null | undefined) {
  return isAdmin(a);
}
export function canManageShares(a: Actor | null | undefined) {
  return isAdmin(a);
}
export function canManageCategories(a: Actor | null | undefined) {
  return isAdmin(a);
}
export function canReopenPeriod(a: Actor | null | undefined) {
  return isAdmin(a);
}
/** Qualquer sócio pode registrar o acerto (fechamento) de um período. */
export function canClosePeriod(a: Actor | null | undefined) {
  return !!a && a.active;
}

/** Nova vigência de participação não pode começar dentro de período já fechado. */
export function canSetShareFrom(a: Actor | null | undefined, validFrom: string, lockedUntil: string | null): Decision {
  if (!isAdmin(a)) return { ok: false, reason: "Somente o administrador altera os percentuais" };
  if (isLocked(validFrom, lockedUntil))
    return { ok: false, reason: `A vigência não pode começar em período já fechado (até ${lockedUntil})` };
  return { ok: true };
}

export function assertDecision(d: Decision): void {
  if (!d.ok) throw new AccessError(d.reason);
}

export function assert(cond: boolean, message = "Acesso negado"): void {
  if (!cond) throw new AccessError(message);
}
