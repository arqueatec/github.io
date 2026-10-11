import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { SetupForm } from "./SetupForm";

export const metadata = { title: "Primeiro acesso" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const [{ n }] = await getDb().select({ n: sql<number>`count(*)::int` }).from(users);
  if (n > 0) redirect("/login");
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-bold">Primeiro acesso</h1>
      <p className="mb-4 text-sm text-[var(--muted)]">
        Crie a conta do administrador. Depois, em Administração, cadastre os outros sócios e defina as partes.
      </p>
      <SetupForm />
    </main>
  );
}
