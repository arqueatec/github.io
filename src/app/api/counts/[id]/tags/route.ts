import { getDb } from "@/db";
import { addCountTag, removeCountTag } from "@/server/services/inventory";
import { authed, intParam, readJson } from "@/server/http";
import { AppError } from "@/server/errors";

export const POST = authed<{ id: string }>(async (req, user, p) => addCountTag(getDb(), user, intParam(p.id), await readJson(req)));
export const DELETE = authed<{ id: string }>(async (req, user, p) => {
  const tag = req.nextUrl.searchParams.get("tag");
  if (!tag) throw new AppError("Informe o brinco");
  await removeCountTag(getDb(), user, intParam(p.id), tag);
  return { ok: true };
});
