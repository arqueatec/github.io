import { getDb } from "@/db";
import { createRevenue } from "@/server/services/finance";
import { authed, readJson } from "@/server/http";

export const POST = authed(async (req, user) => createRevenue(getDb(), user, await readJson(req)));
