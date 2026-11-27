import { getDb } from "@/db";
import { adjustPerfume } from "@/server/services/perfumes";
import { assertArea } from "@/server/auth";
import { authed, readJson } from "@/server/http";

export const POST = authed(async (req, user) => {
  assertArea(user, "perfumes");
  return adjustPerfume(getDb(), user, await readJson(req));
});
