import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { attachments } from "@/db/schema";
import { NotFoundError } from "@/server/errors";
import { authed, intParam } from "@/server/http";

/** Fotos e comprovantes: somente usuários autenticados. */
export const GET = authed<{ id: string }>(async (_req, _user, p) => {
  const [a] = await getDb().select().from(attachments).where(eq(attachments.id, intParam(p.id)));
  if (!a) throw new NotFoundError("Arquivo não encontrado");
  return new Response(new Uint8Array(a.data), {
    headers: { "content-type": a.mime, "cache-control": "private, max-age=86400", "content-disposition": "inline" },
  });
});
