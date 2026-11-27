import { getDb } from "@/db";
import { createPerfume } from "@/server/services/perfumes";
import { assertArea } from "@/server/auth";
import { authed, readJson } from "@/server/http";

export const POST = authed(async (req, user) => {
  assertArea(user, "perfumes");
  return createPerfume(getDb(), user, await readJson(req));
});
