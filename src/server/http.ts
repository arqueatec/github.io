import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { AccessError } from "@/domain/policy";
import { AppError } from "./errors";
import { requireUser, type SessionUser } from "./auth";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(err: unknown) {
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return json({ error: issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join("; "), issues }, 400);
  }
  if (err instanceof AccessError) return json({ error: err.message }, err.status);
  if (err instanceof AppError) return json({ error: err.message, details: err.details }, err.status);
  console.error("[api] erro inesperado", err);
  return json({ error: "Erro interno. Tente novamente; se persistir, avise o administrador." }, 500);
}

/** Bloqueia requisições de mutação vindas de outra origem (proteção CSRF além do SameSite). */
function checkOrigin(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) return; // fetch same-origin sem Origin (alguns navegadores antigos)
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new AccessError("Origem da requisição não permitida");
  } catch (e) {
    if (e instanceof AccessError) throw e;
    throw new AccessError("Origem da requisição inválida");
  }
}

type Ctx<P> = { params: Promise<P> };

/** Envolve um handler autenticado: verifica sessão, origem e converte erros em JSON. */
export function authed<P = Record<string, string>>(
  fn: (req: NextRequest, user: SessionUser, params: P) => Promise<Response | unknown>,
) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      checkOrigin(req);
      const user = await requireUser();
      const params = ctx?.params ? await ctx.params : ({} as P);
      const out = await fn(req, user, params);
      return out instanceof Response ? out : json(out ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function publicHandler<P = Record<string, string>>(fn: (req: NextRequest, params: P) => Promise<Response | unknown>) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      checkOrigin(req);
      const params = ctx?.params ? await ctx.params : ({} as P);
      const out = await fn(req, params);
      return out instanceof Response ? out : json(out ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError("Corpo da requisição inválido (JSON esperado)");
  }
}

export function intParam(v: string | undefined, name = "id"): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(`Parâmetro ${name} inválido`);
  return n;
}
