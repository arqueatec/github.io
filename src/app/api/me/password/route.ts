import { getDb } from "@/db";
import { changeOwnPassword } from "@/server/services/admin";
import { authed, readJson } from "@/server/http";

export const POST = authed(async (req, user) => {
  await changeOwnPassword(getDb(), user, await readJson(req));
  return { ok: true };
});
