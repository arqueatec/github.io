import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { createSession, hashPassword, setSessionCookie } from "@/server/auth";
import { AppError } from "@/server/errors";
import { publicHandler, readJson } from "@/server/http";
import { setupSchema } from "@/lib/schemas";

/** Primeiro acesso: cria o administrador. Só funciona enquanto não houver nenhum usuário. */
export const POST = publicHandler(async (req) => {
  const input = setupSchema.parse(await readJson(req));
  const db = getDb();
  const user = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(4243)`);
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(users);
    if (n > 0) throw new AppError("O sistema já foi configurado", 403);
    const [u] = await tx
      .insert(users)
      .values({ name: input.name, email: input.email, passwordHash: await hashPassword(input.password), role: "admin", party: input.party })
      .returning();
    return u;
  });
  const { token, expiresAt } = await createSession(db, user.id);
  await setSessionCookie(token, expiresAt);
  return { ok: true };
});
