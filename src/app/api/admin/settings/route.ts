import { z } from "zod";
import { getDb } from "@/db";
import { assert, isAdmin } from "@/domain/policy";
import { setSetting } from "@/server/services/inventory";
import { authed, readJson } from "@/server/http";

const schema = z.object({ inventoryTarget: z.coerce.number().int().min(1).max(100000) });

export const PATCH = authed(async (req, user) => {
  assert(isAdmin(user), "Somente o administrador altera configurações");
  const input = schema.parse(await readJson(req));
  await setSetting(getDb(), "inventory_target", input.inventoryTarget);
  return { ok: true };
});
