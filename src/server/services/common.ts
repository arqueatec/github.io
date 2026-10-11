import { and, eq, inArray, sql } from "drizzle-orm";
import type { Exec } from "@/db";
import { animals, attachments, users } from "@/db/schema";
import { AppError, NotFoundError } from "../errors";

export async function findAnimalByTag(db: Exec, tag: string) {
  const [a] = await db
    .select()
    .from(animals)
    .where(sql`lower(${animals.tag}) = lower(${tag.trim()})`)
    .limit(1);
  return a ?? null;
}

export async function requireAnimalByTag(db: Exec, tag: string, opts: { active?: boolean; sex?: "M" | "F"; label?: string } = {}) {
  const a = await findAnimalByTag(db, tag);
  const label = opts.label ?? "Animal";
  if (!a) throw new NotFoundError(`${label} com brinco ${tag} não encontrado`);
  if (opts.active && a.status !== "ativo") throw new AppError(`${label} ${a.tag} não está ativo (${a.status})`);
  if (opts.sex && a.sex !== opts.sex) throw new AppError(`${label} ${a.tag} deve ser ${opts.sex === "F" ? "fêmea" : "macho"}`);
  return a;
}

export async function animalsByTags(db: Exec, tags: string[]) {
  const lower = [...new Set(tags.map((t) => t.trim().toLowerCase()))];
  if (!lower.length) return [];
  const rows = await db.select().from(animals).where(inArray(sql`lower(${animals.tag})`, lower));
  const found = new Set(rows.map((r) => r.tag.toLowerCase()));
  const missing = lower.filter((t) => !found.has(t));
  if (missing.length) throw new NotFoundError(`Brinco(s) não encontrado(s): ${missing.join(", ")}`);
  return rows;
}

export async function requireActiveUser(db: Exec, id: number, label = "Usuário") {
  const [u] = await db.select().from(users).where(and(eq(users.id, id), eq(users.active, true))).limit(1);
  if (!u) throw new AppError(`${label} inválido ou inativo`);
  return u;
}

export async function saveAttachment(db: Exec, photo: { mime: string; base64: string } | null | undefined, userId: number) {
  if (!photo) return null;
  const data = Buffer.from(photo.base64.replace(/^data:[^,]+,/, ""), "base64");
  if (!data.length) return null;
  if (data.length > 2_200_000) throw new AppError("Foto muito grande (máx. 2 MB)");
  const [row] = await db
    .insert(attachments)
    .values({ mime: photo.mime, size: data.length, data, createdBy: userId })
    .returning({ id: attachments.id });
  return row.id;
}
