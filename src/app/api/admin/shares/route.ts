import { getDb } from "@/db";
import { createShareConfig } from "@/server/services/admin";
import { authed, readJson } from "@/server/http";

export const POST = authed(async (req, user) => createShareConfig(getDb(), user, await readJson(req)));
