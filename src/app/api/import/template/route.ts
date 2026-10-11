import { IMPORT_TEMPLATE } from "@/server/services/importExport";
import { authed } from "@/server/http";

export const GET = authed(async () => {
  return new Response(IMPORT_TEMPLATE, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="modelo-rebanho.csv"' },
  });
});
