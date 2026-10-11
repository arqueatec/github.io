"use client";
import { useState } from "react";
import { Field, FormError, toast } from "@/components/forms";
import { Badge } from "@/components/ui";
import { useRouter } from "next/navigation";
import { refreshTags } from "@/lib/client/tags";

export function ExportPicker({ kinds }: { kinds: { value: string; label: string }[] }) {
  const [kind, setKind] = useState(kinds[0].value);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const q = new URLSearchParams();
  if (start) q.set("start", start);
  if (end) q.set("end", end);
  return (
    <div className="space-y-3">
      <Field label="Relatório">
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
          {kinds.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="De (opcional)">
          <input type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Até (opcional)">
          <input type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <div className="flex gap-2">
        <a className="btn btn-primary flex-1" href={`/api/export/${kind}?format=csv&${q}`}>
          Baixar CSV
        </a>
        <a className="btn btn-secondary flex-1" href={`/api/export/${kind}?format=pdf&${q}`}>
          Baixar PDF
        </a>
      </div>
    </div>
  );
}

type Row = { line: number; tag: string; sex: string | null; category: string | null; motherTag: string | null; lotName: string | null; errors: string[] };

export function ImportSheet() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ rows: Row[]; valid: number; invalid: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send(path: "preview" | "commit") {
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/api/import/${path}`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro");
      if (path === "preview") setPreview(data);
      else {
        toast(`${data.imported} animal(is) importado(s)`);
        setPreview(null);
        setFile(null);
        void refreshTags();
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <a className="link text-sm" href="/api/import/template">
        ⬇ Baixar planilha modelo (CSV)
      </a>
      <input
        type="file"
        accept=".csv,.xlsx,text/csv"
        className="input py-2"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setPreview(null);
        }}
      />
      <div className="flex gap-2">
        <button className="btn btn-secondary flex-1" disabled={!file || busy} onClick={() => send("preview")}>
          Conferir
        </button>
        <button className="btn btn-primary flex-1" disabled={!preview || preview.invalid > 0 || busy} onClick={() => send("commit")}>
          Importar {preview ? preview.valid : ""}
        </button>
      </div>
      <FormError error={error} />
      {preview && (
        <div className="space-y-2">
          <p className="text-sm">
            <Badge tone="good">{preview.valid} válida(s)</Badge> <Badge tone={preview.invalid ? "bad" : "good"}>{preview.invalid} com erro</Badge>
          </p>
          <div className="table-wrap max-h-96 overflow-y-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Linha</th>
                  <th>Brinco</th>
                  <th>Sexo</th>
                  <th>Categoria</th>
                  <th>Mãe</th>
                  <th>Lote</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.line}>
                    <td>{r.line}</td>
                    <td>{r.tag}</td>
                    <td>{r.sex}</td>
                    <td>{r.category}</td>
                    <td>{r.motherTag}</td>
                    <td>{r.lotName}</td>
                    <td className={r.errors.length ? "text-[var(--bad)]" : "text-[var(--good)]"}>{r.errors.length ? r.errors.join("; ") : "ok"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
