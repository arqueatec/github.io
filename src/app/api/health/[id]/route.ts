import { getDb } from "@/db";
import { deleteHealthEvent } from "@/server/services/health";
import { authed, intParam } from "@/server/http";

export const DELETE = authed<{ id: string }>(async (_req, user, p) => deleteHealthEvent(getDb(), user, intParam(p.id)));
