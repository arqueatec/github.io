import { getDb } from "@/db";
import { payExpense } from "@/server/services/finance";
import { authed, intParam, readJson } from "@/server/http";

export const POST = authed<{ id: string }>(async (req, user, p) => payExpense(getDb(), user, intParam(p.id), await readJson(req)));
