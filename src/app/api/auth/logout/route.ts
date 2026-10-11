import { destroyCurrentSession } from "@/server/auth";
import { publicHandler } from "@/server/http";

export const POST = publicHandler(async () => {
  await destroyCurrentSession();
  return { ok: true };
});
