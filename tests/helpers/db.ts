import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { setDbForTests, type DB } from "@/db";
import { users } from "@/db/schema";
import type { Actor } from "@/domain/policy";

export const TEST_URL = process.env.TEST_DATABASE_URL;
export const hasDb = !!TEST_URL;

/** Recria o banco de testes do zero e aplica as migrações. */
export async function freshDb(): Promise<{ db: DB; close: () => Promise<void> }> {
  if (!TEST_URL) throw new Error("TEST_DATABASE_URL não definida");
  const admin = postgres(TEST_URL, { max: 1, onnotice: () => {} });
  await admin`drop schema if exists public cascade`;
  await admin`drop schema if exists drizzle cascade`;
  await admin`create schema public`;
  await migrate(drizzle(admin), { migrationsFolder: "./drizzle" });
  await admin.end();
  const { db, client } = setDbForTests(TEST_URL);
  return { db, close: () => client.end() };
}

export async function makeUsers(db: DB) {
  const pw = await bcrypt.hash("senha-teste-123", 4);
  const rows = await db
    .insert(users)
    .values([
      { name: "Admin A", email: "a@t.com", passwordHash: pw, role: "admin", party: "A" },
      { name: "Irmão B1", email: "b1@t.com", passwordHash: pw, role: "socio", party: "B" },
      { name: "Irmão B2", email: "b2@t.com", passwordHash: pw, role: "socio", party: "B" },
    ])
    .returning();
  const toActor = (u: (typeof rows)[number]): Actor => ({ id: u.id, role: u.role, party: u.party, active: u.active });
  return { A: toActor(rows[0]), B1: toActor(rows[1]), B2: toActor(rows[2]), rows };
}
