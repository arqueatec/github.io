import { getDb } from "@/db";
import { createUser } from "@/server/services/admin";
import { authed, readJson } from "@/server/http";

export const POST = authed(async (req, user) => createUser(getDb(), user, await readJson(req)));
