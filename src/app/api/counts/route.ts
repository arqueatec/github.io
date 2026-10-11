import { getDb } from "@/db";
import { createCount } from "@/server/services/inventory";
import { authed, readJson } from "@/server/http";

export const POST = authed(async (req, user) => createCount(getDb(), user, await readJson(req)));
