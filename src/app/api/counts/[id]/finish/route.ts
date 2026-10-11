import { getDb } from "@/db";
import { finishCount } from "@/server/services/inventory";
import { authed, intParam, readJson } from "@/server/http";

export const POST = authed<{ id: string }>(async (req, user, p) => finishCount(getDb(), user, intParam(p.id), await readJson(req)));
