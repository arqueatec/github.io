import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type SessionUser } from "./auth";

/** Usuário logado para páginas (Server Components); redireciona ao login se não houver. */
export async function pageUser(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function pageAdmin(): Promise<SessionUser> {
  const u = await pageUser();
  if (u.role !== "admin") redirect("/?erro=acesso");
  return u;
}

type SP = Record<string, string | string[] | undefined>;
export function sp(params: SP, key: string): string | null {
  const v = params[key];
  return (Array.isArray(v) ? v[0] : v) || null;
}
export function spInt(params: SP, key: string): number | null {
  const v = Number(sp(params, key));
  return Number.isInteger(v) && v > 0 ? v : null;
}
