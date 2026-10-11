import { getDb } from "@/db";
import { registerExit } from "@/server/services/exits";
import { authed, readJson } from "@/server/http";

export const POST = authed(async (req, user) => registerExit(getDb(), user, await readJson(req)));
