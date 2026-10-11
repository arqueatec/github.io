/** Cria o administrador inicial a partir de ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD. */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";

async function main() {
  const name = process.env.ADMIN_NAME ?? "Administrador";
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 8) throw new Error("Defina ADMIN_EMAIL e ADMIN_PASSWORD (mín. 8 caracteres)");
  const db = getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(sql`${users.email} = ${email}`);
  if (n) throw new Error("Já existe usuário com esse e-mail");
  await db.insert(users).values({ name, email, passwordHash: await bcrypt.hash(password, 10), role: "admin", party: "A" });
  console.log(`Administrador ${email} criado (Parte A).`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
