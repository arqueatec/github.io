import { getDb } from "@/db";
import { createExpense } from "@/server/services/finance";
import { authed, readJson } from "@/server/http";

export const POST = authed(async (req, user) => createExpense(getDb(), user, await readJson(req)));
