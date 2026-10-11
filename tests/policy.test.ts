import { describe, expect, it } from "vitest";
import {
  canClosePeriod,
  canCreateFinancial,
  canManageCategories,
  canManageShares,
  canManageUsers,
  canModifyFinancial,
  canReopenPeriod,
  canSetShareFrom,
  canWriteHerd,
  isLocked,
  type Actor,
} from "@/domain/policy";

const admin: Actor = { id: 1, role: "admin", party: "A", active: true };
const b1: Actor = { id: 2, role: "socio", party: "B", active: true };
const b2: Actor = { id: 3, role: "socio", party: "B", active: true };
const inactive: Actor = { id: 4, role: "socio", party: "B", active: false };

describe("perfis de acesso", () => {
  it("somente o administrador gerencia usuários, percentuais, categorias e reabre períodos", () => {
    for (const fn of [canManageUsers, canManageShares, canManageCategories, canReopenPeriod]) {
      expect(fn(admin)).toBe(true);
      expect(fn(b1)).toBe(false);
      expect(fn(null)).toBe(false);
      expect(fn({ ...admin, active: false })).toBe(false);
    }
  });
  it("todos os sócios ativos lançam no rebanho e fecham período", () => {
    expect(canWriteHerd(b1)).toBe(true);
    expect(canWriteHerd(inactive)).toBe(false);
    expect(canClosePeriod(b2)).toBe(true);
    expect(canClosePeriod(null)).toBe(false);
  });
});

describe("lançamentos financeiros", () => {
  const entry = { createdBy: 2, date: "2025-05-10" };
  it("somente o autor edita/exclui", () => {
    expect(canModifyFinancial(b1, entry, null).ok).toBe(true);
    expect(canModifyFinancial(b2, entry, null)).toMatchObject({ ok: false, reason: expect.stringMatching(/Só quem criou/) });
    expect(canModifyFinancial(admin, entry, null).ok).toBe(false); // nem o admin edita lançamento alheio
  });
  it("período fechado bloqueia criação, edição e exclusão", () => {
    expect(isLocked("2025-06-30", "2025-06-30")).toBe(true);
    expect(isLocked("2025-07-01", "2025-06-30")).toBe(false);
    expect(canCreateFinancial(b1, "2025-06-01", "2025-06-30").ok).toBe(false);
    expect(canCreateFinancial(b1, "2025-07-01", "2025-06-30").ok).toBe(true);
    expect(canModifyFinancial(b1, entry, "2025-06-30").ok).toBe(false);
    expect(canModifyFinancial(admin, { createdBy: 1, date: "2025-05-10" }, "2025-06-30").ok).toBe(false);
  });
  it("não permite mover lançamento para dentro de período fechado", () => {
    expect(canModifyFinancial(b1, { createdBy: 2, date: "2025-08-01" }, "2025-06-30", "2025-06-01").ok).toBe(false);
  });
  it("lançamento excluído não pode ser alterado; usuário inativo não lança", () => {
    expect(canModifyFinancial(b1, { ...entry, deletedAt: new Date() }, null).ok).toBe(false);
    expect(canCreateFinancial(inactive, "2025-01-01", null).ok).toBe(false);
  });
  it("vigência de percentual não pode começar em período fechado", () => {
    expect(canSetShareFrom(admin, "2025-01-01", "2025-06-30").ok).toBe(false);
    expect(canSetShareFrom(admin, "2025-07-01", "2025-06-30").ok).toBe(true);
    expect(canSetShareFrom(b1, "2025-07-01", null).ok).toBe(false);
  });
});
