import { getDb } from "@/db";
import { createReimbursement } from "@/server/services/finance";
import { authed, readJson } from "@/server/http";

export const POST = authed(async (req, user) => createReimbursement(getDb(), user, await readJson(req)));
