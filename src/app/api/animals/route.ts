import { getDb } from "@/db";
import { createAnimal } from "@/server/services/animals";
import { authed, readJson } from "@/server/http";

export const POST = authed(async (req, user) => createAnimal(getDb(), user, await readJson(req)));
