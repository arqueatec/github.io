import { getDb } from "@/db";
import { commitImport } from "@/server/services/importExport";
import { readSheet } from "@/server/sheet";
import { authed } from "@/server/http";

export const POST = authed(async (req, user) => commitImport(getDb(), user, await readSheet(req)));
