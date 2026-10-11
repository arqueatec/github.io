import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import type { DB, Exec } from "@/db";
import { auditLog, categories, lots, sessions, shareConfigs, users } from "@/db/schema";
import { reduce, shareFromPercent } from "@/domain/ledger";
import {
  assert,
  assertDecision,
  canManageCategories,
  canManageShares,
  canManageUsers,
  canSetShareFrom,
  isAdmin,
  type Actor,
} from "@/domain/policy";
import { categorySchema, lotSchema, passwordChangeSchema, shareCreateSchema, userCreateSchema, userUpdateSchema } from "@/lib/schemas";
import { AppError, ConflictError, NotFoundError, isUniqueViolation } from "../errors";
import { audit } from "./audit";
import { getLockedUntil } from "./locks";
import bcrypt from "bcryptjs";

const hash = (pw: string) => bcrypt.hash(pw, 10);

// ---------------------------------------------------------------- Usuários

export async function listUsers(db: Exec) {
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, party: users.party, active: users.active, createdAt: users.createdAt })
    .from(users)
    .orderBy(asc(users.party), asc(users.name));
}

export async function createUser(db: DB, actor: Actor, raw: unknown) {
  assert(canManageUsers(actor), "Somente o administrador gerencia usuários");
  const input = userCreateSchema.parse(raw);
  try {
    const [row] = await db
      .insert(users)
      .values({ name: input.name, email: input.email, passwordHash: await hash(input.password), role: input.role, party: input.party })
      .returning({ id: users.id, name: users.name, email: users.email, role: users.role, party: users.party });
    await audit(db, actor.id, "user", row.id, "create", null, row);
    return row;
  } catch (e) {
    if (isUniqueViolation(e)) throw new ConflictError("E-mail já cadastrado");
    throw e;
  }
}

export async function updateUser(db: DB, actor: Actor, id: number, raw: unknown) {
  assert(canManageUsers(actor), "Somente o administrador gerencia usuários");
  const input = userUpdateSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(users).where(eq(users.id, id)).for("update");
    if (!before) throw new NotFoundError("Usuário não encontrado");
    const demoting = (input.role && input.role !== "admin") || input.active === false;
    if (before.role === "admin" && demoting) {
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(users)
        .where(and(eq(users.role, "admin"), eq(users.active, true), ne(users.id, id)));
      if (n === 0) throw new AppError("É preciso manter ao menos um administrador ativo");
    }
    const patch: Partial<typeof users.$inferInsert> = {};
    if (input.name) patch.name = input.name;
    if (input.email) patch.email = input.email;
    if (input.role) patch.role = input.role;
    if (input.party) patch.party = input.party;
    if (input.active !== undefined) patch.active = input.active;
    if (input.password) patch.passwordHash = await hash(input.password);
    try {
      const [after] = await tx.update(users).set(patch).where(eq(users.id, id)).returning();
      if (input.password || input.active === false) await tx.delete(sessions).where(eq(sessions.userId, id));
      await audit(tx, actor.id, "user", id, "update", before, after);
      return { id: after.id };
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictError("E-mail já cadastrado");
      throw e;
    }
  });
}

export async function changeOwnPassword(db: DB, actor: Actor, raw: unknown) {
  const input = passwordChangeSchema.parse(raw);
  const [u] = await db.select().from(users).where(eq(users.id, actor.id));
  if (!u || !(await bcrypt.compare(input.current, u.passwordHash))) throw new AppError("Senha atual incorreta");
  await db.update(users).set({ passwordHash: await hash(input.next) }).where(eq(users.id, actor.id));
}

// ---------------------------------------------------------------- Participações

export async function listShareConfigs(db: Exec) {
  return db
    .select({ id: shareConfigs.id, validFrom: shareConfigs.validFrom, num: shareConfigs.shareANum, den: shareConfigs.shareDen, notes: shareConfigs.notes, createdByName: users.name, createdAt: shareConfigs.createdAt })
    .from(shareConfigs)
    .leftJoin(users, eq(users.id, shareConfigs.createdBy))
    .orderBy(desc(shareConfigs.validFrom));
}

export async function createShareConfig(db: DB, actor: Actor, raw: unknown) {
  assert(canManageShares(actor), "Somente o administrador altera os percentuais");
  const input = shareCreateSchema.parse(raw);
  assertDecision(canSetShareFrom(actor, input.validFrom, await getLockedUntil(db)));
  const { num, den } = input.mode === "fracao" ? reduce(input.num!, input.den!) : shareFromPercent(input.percentA!);
  try {
    const [row] = await db
      .insert(shareConfigs)
      .values({ validFrom: input.validFrom, shareANum: num, shareDen: den, notes: input.notes ?? null, createdBy: actor.id })
      .returning();
    await audit(db, actor.id, "share_config", row.id, "create", null, row);
    return row;
  } catch (e) {
    if (isUniqueViolation(e)) throw new ConflictError("Já existe uma vigência nesta data");
    throw e;
  }
}

export async function deleteShareConfig(db: DB, actor: Actor, id: number) {
  assert(canManageShares(actor), "Somente o administrador altera os percentuais");
  const [row] = await db.select().from(shareConfigs).where(eq(shareConfigs.id, id));
  if (!row) throw new NotFoundError();
  assertDecision(canSetShareFrom(actor, row.validFrom, await getLockedUntil(db)));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(shareConfigs);
  if (n <= 1) throw new AppError("É preciso manter ao menos uma configuração de participação");
  await db.delete(shareConfigs).where(eq(shareConfigs.id, id));
  await audit(db, actor.id, "share_config", id, "delete", row, null);
}

// ---------------------------------------------------------------- Categorias e lotes

export async function listCategories(db: Exec) {
  return db.select().from(categories).orderBy(asc(categories.kind), asc(categories.sortOrder), asc(categories.name));
}

export async function upsertCategory(db: DB, actor: Actor, raw: unknown, id?: number) {
  assert(canManageCategories(actor), "Somente o administrador gerencia categorias");
  const input = categorySchema.parse(raw);
  try {
    if (id) {
      const [row] = await db.update(categories).set({ name: input.name, active: input.active ?? true, sortOrder: input.sortOrder ?? 0 }).where(eq(categories.id, id)).returning();
      if (!row) throw new NotFoundError();
      return row;
    }
    const [row] = await db.insert(categories).values({ kind: input.kind, name: input.name, sortOrder: input.sortOrder ?? 50 }).returning();
    return row;
  } catch (e) {
    if (isUniqueViolation(e)) throw new ConflictError("Categoria já existe");
    throw e;
  }
}

export async function listLots(db: Exec, onlyActive = false) {
  const rows = await db
    .select({ id: lots.id, name: lots.name, description: lots.description, active: lots.active, animals: sql<number>`(select count(*)::int from animals a where a.lot_id = ${lots.id} and a.status = 'ativo')` })
    .from(lots)
    .orderBy(asc(lots.name));
  return onlyActive ? rows.filter((l) => l.active) : rows;
}

/** Lotes podem ser criados por qualquer sócio (manejo); só o administrador desativa. */
export async function upsertLot(db: DB, actor: Actor, raw: unknown, id?: number) {
  const input = lotSchema.parse(raw);
  if (input.active === false) assert(isAdmin(actor), "Somente o administrador desativa lotes");
  try {
    if (id) {
      const [row] = await db.update(lots).set({ name: input.name, description: input.description ?? null, active: input.active ?? true }).where(eq(lots.id, id)).returning();
      if (!row) throw new NotFoundError();
      return row;
    }
    const [row] = await db.insert(lots).values({ name: input.name, description: input.description ?? null }).returning();
    return row;
  } catch (e) {
    if (isUniqueViolation(e)) throw new ConflictError("Já existe lote com esse nome");
    throw e;
  }
}

// ---------------------------------------------------------------- Auditoria

export async function listAudit(db: Exec, opts: { entity?: string | null; limit?: number } = {}) {
  return db
    .select({ id: auditLog.id, at: auditLog.at, userName: users.name, entity: auditLog.entity, entityId: auditLog.entityId, action: auditLog.action, before: auditLog.before, after: auditLog.after })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .where(opts.entity ? eq(auditLog.entity, opts.entity) : undefined)
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(opts.limit ?? 200);
}
