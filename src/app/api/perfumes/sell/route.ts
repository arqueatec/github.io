import { getDb } from "@/db";
import { sellPerfume } from "@/server/services/perfumes";
import { assertArea } from "@/server/auth";
import { authed, readJson } from "@/server/http";

export const POST = authed(async (req, user) => {
  assertArea(user, "perfumes");
  return sellPerfume(getDb(), user, await readJson(req));
});
