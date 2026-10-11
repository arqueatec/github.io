import { getDb } from "@/db";
import { deleteBirth } from "@/server/services/reproduction";
import { authed, intParam } from "@/server/http";

export const DELETE = authed<{ id: string }>(async (_req, user, p) => deleteBirth(getDb(), user, intParam(p.id)));
