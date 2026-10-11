import { getDb } from "@/db";
import { login, setSessionCookie } from "@/server/auth";
import { publicHandler, readJson } from "@/server/http";
import { loginSchema } from "@/lib/schemas";

export const POST = publicHandler(async (req) => {
  const { email, password } = loginSchema.parse(await readJson(req));
  const { token, expiresAt } = await login(getDb(), email, password);
  await setSessionCookie(token, expiresAt);
  return { ok: true };
});
