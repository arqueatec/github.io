import { getDb } from "@/db";
import { closePeriod } from "@/server/services/locks";
import { authed, readJson } from "@/server/http";

export const POST = authed(async (req, user) => closePeriod(getDb(), user, await readJson(req)));
