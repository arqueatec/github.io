import { getDb } from "@/db";
import { createPregnancyCheck } from "@/server/services/reproduction";
import { authed, readJson } from "@/server/http";

export const POST = authed(async (req, user) => createPregnancyCheck(getDb(), user, await readJson(req)));
