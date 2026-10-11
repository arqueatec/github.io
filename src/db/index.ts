import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

declare global {
  // eslint-disable-next-line no-var
  var __ovinosDb: { db: DB; client: postgres.Sql } | undefined;
}

function create(url: string) {
  // prepare:false => compatível com poolers em modo transação (Neon/Supabase/pgbouncer).
  const client = postgres(url, { prepare: false, max: process.env.VERCEL ? 1 : 10, idle_timeout: 20 });
  return { client, db: drizzle(client, { schema }) };
}

/** Conexão única por processo (reaproveitada entre invocações serverless e no hot-reload). */
export function getDb(): DB {
  if (!globalThis.__ovinosDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não configurada");
    globalThis.__ovinosDb = create(url);
  }
  return globalThis.__ovinosDb.db;
}

/** Usado pelos testes para apontar para outro banco. */
export function setDbForTests(url: string) {
  globalThis.__ovinosDb = create(url);
  return globalThis.__ovinosDb;
}

export { schema };

/** Executor aceito pelos serviços: a conexão ou uma transação em andamento. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Exec = DB | Tx;
