import { getDb } from "@/db";
import { registerSale } from "@/server/services/exits";
import { authed, readJson } from "@/server/http";

export const POST = authed(async (req, user) => registerSale(getDb(), user, await readJson(req)));
