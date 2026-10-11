import { getDb } from "@/db";
import { createWeanings } from "@/server/services/reproduction";
import { authed, readJson } from "@/server/http";

export const POST = authed(async (req, user) => createWeanings(getDb(), user, await readJson(req)));
