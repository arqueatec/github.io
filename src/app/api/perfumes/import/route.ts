import { getDb } from "@/db";
import { importPerfumes } from "@/server/services/perfumes";
import { assertArea } from "@/server/auth";
import { readUpload } from "@/server/sheet";
import { authed } from "@/server/http";

export const POST = authed(async (req, user) => {
  assertArea(user, "perfumes");
  const { buffer } = await readUpload(req);
  return importPerfumes(getDb(), user, buffer);
});
