import { getDb } from "@/db";
import { createWeighings } from "@/server/services/health";
import { authed, readJson } from "@/server/http";

export const POST = authed(async (req, user) => createWeighings(getDb(), user, await readJson(req)));
