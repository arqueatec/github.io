import { parseHerdSheet } from "./services/importExport";
import { AppError } from "./errors";

export async function readSheet(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") throw new AppError("Envie um arquivo .csv ou .xlsx");
  if (file.size > 3_000_000) throw new AppError("Arquivo muito grande (máx. 3 MB)");
  return parseHerdSheet({ name: file.name, buffer: Buffer.from(await file.arrayBuffer()) });
}
