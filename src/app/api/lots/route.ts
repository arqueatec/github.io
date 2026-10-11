import { getDb } from "@/db";
import { upsertLot } from "@/server/services/admin";
import { authed, readJson } from "@/server/http";

export const POST = authed(async (req, user) => upsertLot(getDb(), user, await readJson(req)));
