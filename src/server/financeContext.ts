import "server-only";
import { getDb } from "@/db";
import { listLots } from "./services/admin";
import { activeCategories, activeUsers, getShares } from "./services/finance";
import { getLockedUntil } from "./services/locks";
import { shareAt } from "@/domain/ledger";
import { todayIso } from "@/domain/dates";

/** Dados comuns aos formulários financeiros. */
export async function financeFormContext(kind: "despesa" | "receita") {
  const db = getDb();
  const [users, categories, lots, lockedUntil, shares] = await Promise.all([
    activeUsers(db),
    activeCategories(db, kind),
    listLots(db, true),
    getLockedUntil(db),
    getShares(db),
  ]);
  const s = shareAt(shares, todayIso());
  return { users, categories, lots: lots.map((l) => ({ id: l.id, name: l.name })), lockedUntil, share: { num: s.num, den: s.den } };
}
