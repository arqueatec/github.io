import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/server/auth";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const [{ n }] = await getDb().select({ n: sql<number>`count(*)::int` }).from(users);
  if (n === 0) redirect("/setup");
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <div className="text-5xl" aria-hidden>
          🐑
        </div>
        <h1 className="mt-2 text-2xl font-bold">Rebanho</h1>
        <p className="text-sm text-[var(--muted)]">Gestão da criação em sociedade</p>
      </div>
      <LoginForm next={next && next.startsWith("/") && !next.startsWith("//") ? next : "/"} />
    </main>
  );
}
