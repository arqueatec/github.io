import { getDb } from "@/db";
import { restockPerfume } from "@/server/services/perfumes";
import { assertArea } from "@/server/auth";
import { authed, readJson } from "@/server/http";

export const POST = authed(async (req, user) => {
  assertArea(user, "perfumes");
  return restockPerfume(getDb(), user, await readJson(req));
});
