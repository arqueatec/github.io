import { getDb } from "@/db";
import { upsertCategory } from "@/server/services/admin";
import { authed, readJson } from "@/server/http";

export const POST = authed(async (req, user) => upsertCategory(getDb(), user, await readJson(req)));
