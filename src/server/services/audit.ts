import type { Exec } from "@/db";
import { auditLog } from "@/db/schema";

function sanitize(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  return JSON.parse(
    JSON.stringify(v, (k, val) => {
      if (k === "data" || k === "passwordHash" || k === "base64") return undefined;
      return val;
    }),
  );
}

export async function audit(
  db: Exec,
  userId: number | null,
  entity: string,
  entityId: number | null,
  action: "create" | "update" | "delete" | "lock" | "reopen" | "restore",
  before: unknown,
  after: unknown,
) {
  await db.insert(auditLog).values({
    userId,
    entity,
    entityId,
    action,
    before: sanitize(before) as object | null,
    after: sanitize(after) as object | null,
  });
}
