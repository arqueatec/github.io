import { getDb } from "@/db";
import { deleteAnimal, updateAnimal } from "@/server/services/animals";
import { authed, intParam, readJson } from "@/server/http";

export const PATCH = authed<{ id: string }>(async (req, user, p) => updateAnimal(getDb(), user, intParam(p.id), await readJson(req)));
export const DELETE = authed<{ id: string }>(async (_req, user, p) => deleteAnimal(getDb(), user, intParam(p.id)));
