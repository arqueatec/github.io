import { getDb } from "@/db";
import { createHealthEvents } from "@/server/services/health";
import { authed, readJson } from "@/server/http";

export const POST = authed(async (req, user) => createHealthEvents(getDb(), user, await readJson(req)));
