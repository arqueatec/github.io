import { getDb } from "@/db";
import { deletePerfumeMovement } from "@/server/services/perfumes";
import { assertArea } from "@/server/auth";
import { authed, intParam } from "@/server/http";

export const DELETE = authed<{ id: string }>(async (_req, user, p) => {
  assertArea(user, "perfumes");
  return deletePerfumeMovement(getDb(), user, intParam(p.id));
});
