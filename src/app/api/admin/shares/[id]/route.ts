import { getDb } from "@/db";
import { deleteShareConfig } from "@/server/services/admin";
import { authed, intParam } from "@/server/http";

export const DELETE = authed<{ id: string }>(async (_req, user, p) => deleteShareConfig(getDb(), user, intParam(p.id)));
