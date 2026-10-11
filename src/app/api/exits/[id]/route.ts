import { getDb } from "@/db";
import { undoExit } from "@/server/services/exits";
import { authed, intParam } from "@/server/http";

export const DELETE = authed<{ id: string }>(async (_req, user, p) => undoExit(getDb(), user, intParam(p.id)));
