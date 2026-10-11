/** Aplica as migrações pendentes (pasta ./drizzle). Usado localmente e no build da Vercel. */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (process.env.VERCEL) {
      console.error("DATABASE_URL não definida na Vercel — configure a variável de ambiente.");
      process.exit(1);
    }
    console.warn("DATABASE_URL não definida; migrações ignoradas.");
    return;
  }
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    console.log("Migrações aplicadas.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
