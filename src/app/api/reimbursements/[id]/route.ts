import { getDb } from "@/db";
import { deleteReimbursement, updateReimbursement } from "@/server/services/finance";
import { authed, intParam, readJson } from "@/server/http";

export const PATCH = authed<{ id: string }>(async (req, user, p) => updateReimbursement(getDb(), user, intParam(p.id), await readJson(req)));
export const DELETE = authed<{ id: string }>(async (_req, user, p) => deleteReimbursement(getDb(), user, intParam(p.id)));
