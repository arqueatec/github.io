import { getDb } from "@/db";
import { createBirth } from "@/server/services/reproduction";
import { authed, readJson } from "@/server/http";

export const POST = authed(async (req, user) => createBirth(getDb(), user, await readJson(req)));
