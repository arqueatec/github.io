import { getDb } from "@/db";
import { deleteRevenue, updateRevenue } from "@/server/services/finance";
import { authed, intParam, readJson } from "@/server/http";

export const PATCH = authed<{ id: string }>(async (req, user, p) => updateRevenue(getDb(), user, intParam(p.id), await readJson(req)));
export const DELETE = authed<{ id: string }>(async (_req, user, p) => deleteRevenue(getDb(), user, intParam(p.id)));
