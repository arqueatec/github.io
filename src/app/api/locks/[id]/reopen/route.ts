import { getDb } from "@/db";
import { reopenPeriod } from "@/server/services/locks";
import { authed, intParam, readJson } from "@/server/http";

export const POST = authed<{ id: string }>(async (req, user, p) => reopenPeriod(getDb(), user, intParam(p.id), await readJson(req)));
