import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, gte, lt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { getDb, type DB } from "@/db";
import { loginAttempts, sessions, users } from "@/db/schema";
import { AccessError } from "@/domain/policy";
import type { Actor } from "@/domain/policy";
import { AppError, UnauthenticatedError } from "./errors";

export const SESSION_COOKIE = "ovinos_session";
const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

export interface SessionUser extends Actor {
  name: string;
  email: string;
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

function hashToken(token: string) {
  return createHash("sha256")
    .update(token + (process.env.SESSION_SECRET ?? ""))
    .digest("hex");
}

function sessionDays() {
  const d = Number(process.env.SESSION_DAYS ?? 30);
  return Number.isFinite(d) && d > 0 ? d : 30;
}

export async function createSession(db: DB, userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionDays() * 86_400_000);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  // limpeza oportunista de sessões expiradas
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await getDb().delete(sessions).where(eq(sessions.id, hashToken(token)));
  jar.delete(SESSION_COOKIE);
}

export async function userFromToken(db: DB, token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      party: users.party,
      active: users.active,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const u = rows[0];
  if (!u || !u.active) return null;
  return u;
}

/** Usuário da requisição atual (memoizado por requisição). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  return userFromToken(getDb(), jar.get(SESSION_COOKIE)?.value);
});

export async function requireUser(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) throw new UnauthenticatedError();
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "admin") throw new AccessError("Somente o administrador pode fazer isso");
  return u;
}

export async function login(db: DB, emailRaw: string, password: string) {
  const email = emailRaw.trim().toLowerCase();
  const since = new Date(Date.now() - LOCK_MINUTES * 60_000);
  const [{ failed }] = await db
    .select({ failed: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.email, email), eq(loginAttempts.success, false), gte(loginAttempts.at, since)));
  if (failed >= MAX_FAILED) {
    throw new AppError(`Muitas tentativas. Aguarde ${LOCK_MINUTES} minutos e tente novamente.`, 429);
  }
  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const ok = !!u && u.active && (await verifyPassword(password, u.passwordHash));
  await db.insert(loginAttempts).values({ email, success: ok });
  if (!ok) throw new AppError("E-mail ou senha inválidos", 401);
  if (ok) {
    await db
      .delete(loginAttempts)
      .where(and(eq(loginAttempts.email, email), eq(loginAttempts.success, false)));
  }
  return createSession(db, u.id);
}
