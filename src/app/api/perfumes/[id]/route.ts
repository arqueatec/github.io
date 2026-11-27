import { getDb } from "@/db";
import { updatePerfume } from "@/server/services/perfumes";
import { assertArea } from "@/server/auth";
import { authed, intParam, readJson } from "@/server/http";

export const PATCH = authed<{ id: string }>(async (req, user, p) => {
  assertArea(user, "perfumes");
  return updatePerfume(getDb(), user, intParam(p.id), await readJson(req));
});
