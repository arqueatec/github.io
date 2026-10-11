import { getDb } from "@/db";
import { previewImport } from "@/server/services/importExport";
import { readSheet } from "@/server/sheet";
import { authed } from "@/server/http";

export const POST = authed(async (req) => previewImport(getDb(), await readSheet(req)));
