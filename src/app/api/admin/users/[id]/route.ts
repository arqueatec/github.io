import { getDb } from "@/db";
import { updateUser } from "@/server/services/admin";
import { authed, intParam, readJson } from "@/server/http";

export const PATCH = authed<{ id: string }>(async (req, user, p) => updateUser(getDb(), user, intParam(p.id), await readJson(req)));
