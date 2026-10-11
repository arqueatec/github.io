import { getDb } from "@/db";
import { upsertCategory } from "@/server/services/admin";
import { authed, intParam, readJson } from "@/server/http";

export const PATCH = authed<{ id: string }>(async (req, user, p) => upsertCategory(getDb(), user, await readJson(req), intParam(p.id)));
