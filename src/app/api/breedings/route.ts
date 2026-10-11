import { getDb } from "@/db";
import { createBreedings } from "@/server/services/reproduction";
import { authed, readJson } from "@/server/http";

export const POST = authed(async (req, user) => createBreedings(getDb(), user, await readJson(req)));
