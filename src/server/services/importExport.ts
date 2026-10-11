import Papa from "papaparse";
import { eq, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { animals, lots } from "@/db/schema";
import { isIsoDate, todayIso } from "@/domain/dates";
import { assert, canWriteHerd, type Actor } from "@/domain/policy";
import { animalCreateSchema, CATEGORY } from "@/lib/schemas";
import { AppError } from "../errors";
import { audit } from "./audit";
import { findAnimalByTag } from "./common";
import { insertAnimal } from "./animals";

// ---------------------------------------------------------------- Exportação

/** CSV com separador ";" e BOM (abre corretamente no Excel em português). */
export function toCsv(rows: Record<string, unknown>[], columns?: { key: string; label: string }[]): string {
  const cols = columns ?? Object.keys(rows[0] ?? {}).map((k) => ({ key: k, label: k }));
  const data = rows.map((r) => cols.map((c) => fmtCell(r[c.key])));
  return "﻿" + Papa.unparse({ fields: cols.map((c) => c.label), data }, { delimiter: ";" });
}

function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") return String(v).replace(".", ",");
  return String(v);
}

export function centsCell(c: number | null | undefined) {
  if (c === null || c === undefined) return "";
  return (c / 100).toFixed(2).replace(".", ",");
}

export async function toPdf(title: string, subtitle: string, sections: { heading?: string; head: string[]; body: (string | number)[][] }[]) {
  const { jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(14);
  doc.text(title, 14, 14);
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(subtitle, 14, 20);
  doc.setTextColor(0);
  let y = 26;
  for (const s of sections) {
    if (s.heading) {
      if (y > 180) {
        doc.addPage();
        y = 14;
      }
      doc.setFontSize(11);
      doc.text(s.heading, 14, y);
      y += 3;
    }
    autoTable(doc, {
      startY: y,
      head: [s.head],
      body: s.body.map((r) => r.map((c) => String(c))),
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [46, 95, 60] },
      margin: { left: 14, right: 14 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} — página ${i}/${pages}`, 14, 205);
  }
  return Buffer.from(doc.output("arraybuffer"));
}

// ---------------------------------------------------------------- Importação

export interface ImportRow {
  line: number;
  tag: string;
  sex: "M" | "F" | null;
  category: string | null;
  breed: string | null;
  birthDate: string | null;
  ageMonths: number | null;
  motherTag: string | null;
  fatherTag: string | null;
  lotName: string | null;
  entryDate: string | null;
  notes: string | null;
  errors: string[];
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const HEADER_ALIASES: Record<string, string[]> = {
  tag: ["brinco", "tag", "numero", "n", "id", "identificacao"],
  sex: ["sexo", "sex"],
  category: ["categoria", "category", "tipo"],
  breed: ["raca", "breed"],
  birthDate: ["nascimento", "datanascimento", "dtnascimento", "datadenascimento", "birthdate"],
  ageMonths: ["idademeses", "idade", "idadeestimada", "idadeestimadameses"],
  motherTag: ["mae", "brincomae", "matriz"],
  fatherTag: ["pai", "brincopai", "reprodutor"],
  lotName: ["lote", "piquete", "lotepiquete"],
  entryDate: ["entrada", "dataentrada", "datadeentrada"],
  notes: ["observacoes", "obs", "observacao", "notas"],
};

function parseDateCell(v: string): string | null | "invalid" {
  const s = v.trim();
  if (!s) return null;
  if (isIsoDate(s)) return s;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const iso = `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return isIsoDate(iso) ? iso : "invalid";
  }
  return "invalid";
}

function parseSex(v: string): "M" | "F" | null {
  const s = norm(v);
  if (["m", "macho", "male"].includes(s)) return "M";
  if (["f", "femea", "female"].includes(s)) return "F";
  return null;
}

function parseCategory(v: string): string | null {
  const s = norm(v);
  if (!s) return null;
  if (s.startsWith("matriz") || s === "ovelha") return "matriz";
  if (s.startsWith("reprod") || s === "carneiro") return "reprodutor";
  if (s.startsWith("cordeir")) return "cordeiro";
  if (s.startsWith("borreg")) return "borrego";
  if (s.startsWith("descarte")) return "descarte";
  return (CATEGORY as readonly string[]).includes(s) ? s : "invalid";
}

/** Lê CSV (separador ; ou ,) ou XLSX e devolve linhas normalizadas com erros por linha. */
export async function parseHerdSheet(file: { name: string; buffer: Buffer }): Promise<ImportRow[]> {
  let records: Record<string, string>[];
  if (/\.xlsx$/i.test(file.name)) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new AppError("Planilha vazia");
    const header: string[] = [];
    ws.getRow(1).eachCell((c, i) => (header[i] = String(c.text ?? "")));
    records = [];
    ws.eachRow((row, idx) => {
      if (idx === 1) return;
      const rec: Record<string, string> = {};
      header.forEach((h, i) => {
        const cell = row.getCell(i);
        const v = cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : String(cell.text ?? "");
        rec[h] = v;
      });
      records.push(rec);
    });
  } else {
    const text = file.buffer.toString("utf8").replace(/^﻿/, "");
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, delimiter: "" });
    records = parsed.data;
  }
  if (!records.length) throw new AppError("Nenhuma linha encontrada na planilha");
  if (records.length > 2000) throw new AppError("Máximo de 2000 linhas por importação");

  const keys = Object.keys(records[0]);
  const map: Record<string, string> = {};
  for (const k of keys) {
    const n = norm(k);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) if (aliases.includes(n) && !map[field]) map[field] = k;
  }
  if (!map.tag) throw new AppError("Coluna 'brinco' não encontrada. Baixe o modelo de planilha.");

  const seen = new Map<string, number>();
  return records.map((r, i) => {
    const get = (f: string) => (map[f] ? String(r[map[f]] ?? "").trim() : "");
    const errors: string[] = [];
    const tag = get("tag");
    if (!tag) errors.push("Brinco vazio");
    const dupLine = seen.get(tag.toLowerCase());
    if (tag && dupLine) errors.push(`Brinco repetido na linha ${dupLine}`);
    seen.set(tag.toLowerCase(), i + 2);
    const sex = parseSex(get("sex"));
    if (!sex) errors.push("Sexo inválido (use M ou F)");
    const category = parseCategory(get("category"));
    if (!category) errors.push("Categoria vazia");
    else if (category === "invalid") errors.push("Categoria inválida");
    const bd = parseDateCell(get("birthDate"));
    if (bd === "invalid") errors.push("Data de nascimento inválida");
    const ed = parseDateCell(get("entryDate"));
    if (ed === "invalid") errors.push("Data de entrada inválida");
    const ageRaw = get("ageMonths").replace(",", ".");
    const ageMonths = ageRaw ? Number(ageRaw) : null;
    if (ageRaw && (!Number.isFinite(ageMonths) || ageMonths! < 0)) errors.push("Idade inválida");
    return {
      line: i + 2,
      tag,
      sex,
      category: category === "invalid" ? null : category,
      breed: get("breed") || null,
      birthDate: bd === "invalid" ? null : bd,
      ageMonths: Number.isFinite(ageMonths) ? ageMonths : null,
      motherTag: get("motherTag") || null,
      fatherTag: get("fatherTag") || null,
      lotName: get("lotName") || null,
      entryDate: ed === "invalid" ? null : ed,
      notes: get("notes") || null,
      errors,
    };
  });
}

/** Valida contra o banco (duplicados, pais) sem gravar. */
export async function previewImport(db: DB, rows: ImportRow[]) {
  const inFile = new Map(rows.map((r) => [r.tag.toLowerCase(), r]));
  for (const r of rows) {
    if (r.tag && (await findAnimalByTag(db, r.tag))) r.errors.push("Brinco já cadastrado no sistema");
    for (const [label, t, sex] of [["Mãe", r.motherTag, "F"], ["Pai", r.fatherTag, "M"]] as const) {
      if (!t) continue;
      const f = inFile.get(t.toLowerCase());
      if (f) {
        if (f.sex !== sex) r.errors.push(`${label} ${t} com sexo incompatível`);
        continue;
      }
      const a = await findAnimalByTag(db, t);
      if (!a) r.errors.push(`${label} ${t} não encontrado(a)`);
      else if (a.sex !== sex) r.errors.push(`${label} ${t} com sexo incompatível`);
    }
    const parsed = animalCreateSchema.safeParse({ tag: r.tag, sex: r.sex, category: r.category, breed: r.breed });
    if (!parsed.success) for (const iss of parsed.error.issues) if (!r.errors.includes(iss.message)) r.errors.push(iss.message);
  }
  return { rows, valid: rows.filter((r) => !r.errors.length).length, invalid: rows.filter((r) => r.errors.length).length };
}

/** Importa tudo ou nada (transação). Lotes inexistentes são criados. */
export async function commitImport(db: DB, actor: Actor, rows: ImportRow[]) {
  assert(canWriteHerd(actor));
  const { invalid } = await previewImport(db, rows);
  if (invalid) throw new AppError(`Há ${invalid} linha(s) com erro. Corrija a planilha antes de importar.`);
  return db.transaction(async (tx) => {
    const lotIds = new Map<string, number>();
    for (const name of new Set(rows.map((r) => r.lotName).filter((x): x is string => !!x))) {
      const [l] = await tx.select().from(lots).where(sql`lower(${lots.name}) = lower(${name})`);
      lotIds.set(name.toLowerCase(), l ? l.id : (await tx.insert(lots).values({ name }).returning())[0].id);
    }
    const created = new Map<string, number>();
    for (const r of rows) {
      const a = await insertAnimal(tx, actor, {
        tag: r.tag,
        sex: r.sex!,
        category: r.category as (typeof CATEGORY)[number],
        breed: r.breed,
        birthDate: r.birthDate,
        ageMonths: r.ageMonths,
        lotId: r.lotName ? lotIds.get(r.lotName.toLowerCase()) : null,
        origin: "importacao",
        entryDate: r.entryDate ?? todayIso(),
        notes: r.notes,
      });
      created.set(r.tag.toLowerCase(), a.id);
    }
    // segunda passada: genealogia (pais podem estar na própria planilha)
    for (const r of rows) {
      const id = created.get(r.tag.toLowerCase())!;
      const resolve = async (t: string | null) =>
        t ? created.get(t.toLowerCase()) ?? (await findAnimalByTag(tx, t))?.id ?? null : null;
      const motherId = await resolve(r.motherTag);
      const fatherId = await resolve(r.fatherTag);
      if (motherId || fatherId) await tx.update(animals).set({ motherId, fatherId }).where(eq(animals.id, id));
    }
    await audit(tx, actor.id, "animal_import", null, "create", null, { count: rows.length, tags: rows.map((r) => r.tag) });
    return { imported: rows.length };
  });
}

export const IMPORT_TEMPLATE =
  "﻿brinco;sexo;categoria;raca;nascimento;idade_meses;mae;pai;lote;entrada;observacoes\n" +
  "101;F;matriz;Santa Inês;;36;;;Piquete 1;;Idade estimada\n" +
  "102;F;borrego;Dorper;15/03/2025;;101;R1;Piquete 1;;\n";
