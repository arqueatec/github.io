/** Apaga TODO o banco apontado por DATABASE_URL (somente para desenvolvimento). */
import "dotenv/config";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) throw new Error("Reset bloqueado em produção");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql`drop schema if exists public cascade`;
  await sql`drop schema if exists drizzle cascade`;
  await sql`create schema public`;
  await sql.end();
  console.log("Banco limpo.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
