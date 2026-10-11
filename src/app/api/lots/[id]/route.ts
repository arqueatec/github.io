import { getDb } from "@/db";
import { upsertLot } from "@/server/services/admin";
import { authed, intParam, readJson } from "@/server/http";

export const PATCH = authed<{ id: string }>(async (req, user, p) => upsertLot(getDb(), user, await readJson(req), intParam(p.id)));
