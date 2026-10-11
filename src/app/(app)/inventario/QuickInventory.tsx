"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { apiSend, ApiError } from "@/lib/client/api";
import { addLocalTag, findTag, useTags } from "@/lib/client/tags";
import { Field, FormError, PhotoInput, Segmented, TagInput, toast, todayLocal } from "@/components/forms";
import { CATEGORY_LABEL, categoryLabel } from "@/lib/labels";
import { cx } from "@/components/ui";

const AGES = [
  { label: "< 6 m", months: 3 },
  { label: "6–12 m", months: 9 },
  { label: "1–2 a", months: 18 },
  { label: "2–4 a", months: 36 },
  { label: "4+ a", months: 60 },
];

type Entry = { tag: string; sex: "M" | "F"; category: string; queued: boolean };
const SESSION_KEY = "ovinos-inventory-session";

export function QuickInventory({ lots, initialTotal, target }: { lots: { id: number; name: string }[]; initialTotal: number; target: number }) {
  const tags = useTags();
  const tagRef = useRef<HTMLInputElement>(null);
  const [tag, setTag] = useState("");
  const [sex, setSex] = useState<"M" | "F">("F");
  const [category, setCategory] = useState("matriz");
  const [ageMode, setAgeMode] = useState<"idade" | "data" | "desconhecida">("idade");
  const [ageMonths, setAgeMonths] = useState<number | null>(36);
  const [birthDate, setBirthDate] = useState("");
  const [motherTag, setMotherTag] = useState("");
  const [lotId, setLotId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<{ mime: "image/jpeg"; base64: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Entry[]>([]);

  useEffect(() => {
    try {
      setSession(JSON.parse(localStorage.getItem(SESSION_KEY) ?? "[]"));
      setLotId(localStorage.getItem("ovinos-inventory-lot") ?? "");
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {}
  }, [session]);

  const dup = tag.trim() ? findTag(tags, tag) : undefined;
  const queuedCount = session.filter((s) => s.queued).length;
  const total = initialTotal + queuedCount;
  const pct = Math.min(100, Math.round((total / Math.max(1, target)) * 100));
  const summary = session.reduce<Record<string, number>>((acc, s) => {
    const k = categoryLabel(s.category, s.sex);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  const changeSex = (v: "M" | "F") => {
    setSex(v);
    if (v === "M" && category === "matriz") setCategory("reprodutor");
    if (v === "F" && category === "reprodutor") setCategory("matriz");
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const t = tag.trim();
    if (!t) return;
    if (dup) {
      setError(`Brinco ${t} já cadastrado (${categoryLabel(dup.category, dup.sex)}). Confira o número.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await apiSend(
        "POST",
        "/api/animals",
        {
          tag: t,
          sex,
          category,
          ageMonths: ageMode === "idade" ? ageMonths : null,
          birthDate: ageMode === "data" ? birthDate : null,
          motherTag: motherTag.trim() || null,
          lotId: lotId ? Number(lotId) : null,
          origin: "inventario",
          entryDate: todayLocal(),
          notes: notes || (ageMode === "idade" ? "Idade estimada no inventário" : null),
          photo,
        },
        { offline: `Inventário: brinco ${t}` },
      );
      addLocalTag({ id: (r.data as { id?: number } | null)?.id, tag: t, sex, category, status: "ativo" });
      setSession((s) => [{ tag: t, sex, category, queued: r.queued }, ...s]);
      toast(r.queued ? `${t} guardado offline` : `${t} cadastrado ✓`, r.queued ? "info" : "ok");
      setTag("");
      setMotherTag("");
      setNotes("");
      setPhoto(null);
      tagRef.current?.focus();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-[var(--muted)]">Progresso do efetivo</span>
          <span className="text-2xl font-bold tabular-nums">
            {total} <span className="text-base font-normal text-[var(--muted)]">/ ~{target}</span>
          </span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-[var(--surface-2)]">
          <div className="h-full bg-[var(--primary)] transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {session.length} anotado(s) nesta sessão{queuedCount ? ` · ${queuedCount} aguardando sinal` : ""}
        </p>
      </div>

      <form onSubmit={save} className="card space-y-4">
        <Field label="Nº do brinco" error={dup ? `Já cadastrado: ${categoryLabel(dup.category, dup.sex)}` : null}>
          <input
            ref={tagRef}
            className={cx("input min-h-14 text-2xl font-bold tracking-wide", dup && "input-warn")}
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            autoFocus
            autoCapitalize="characters"
            autoComplete="off"
            enterKeyHint="done"
            required
          />
        </Field>
        <Field label="Sexo">
          <Segmented value={sex} onChange={changeSex} options={[{ value: "F", label: "♀ Fêmea" }, { value: "M", label: "♂ Macho" }]} />
        </Field>
        <Field label="Categoria">
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(CATEGORY_LABEL)
              .filter(([k]) => !(sex === "M" && k === "matriz") && !(sex === "F" && k === "reprodutor"))
              .map(([k]) => (
                <button type="button" key={k} onClick={() => setCategory(k)} className={cx("btn", category === k ? "btn-primary" : "btn-secondary")}>
                  {categoryLabel(k, sex)}
                </button>
              ))}
          </div>
        </Field>
        <Field label="Idade">
          <Segmented
            value={ageMode}
            onChange={setAgeMode}
            options={[
              { value: "idade", label: "Estimada" },
              { value: "data", label: "Sei a data" },
              { value: "desconhecida", label: "Não sei" },
            ]}
          />
        </Field>
        {ageMode === "idade" && (
          <div className="grid grid-cols-5 gap-1">
            {AGES.map((a) => (
              <button type="button" key={a.months} onClick={() => setAgeMonths(a.months)} className={cx("btn btn-sm min-h-11", ageMonths === a.months ? "btn-primary" : "btn-secondary")}>
                {a.label}
              </button>
            ))}
          </div>
        )}
        {ageMode === "data" && <input type="date" className="input" value={birthDate} max={todayLocal()} onChange={(e) => setBirthDate(e.target.value)} />}
        <Field label="Mãe (se souber)">
          <TagInput value={motherTag} onChange={setMotherTag} filter={(t) => t.sex === "F"} placeholder="Brinco da mãe" />
        </Field>
        <Field label="Lote / piquete" hint="Fica selecionado para os próximos.">
          <select
            className="select"
            value={lotId}
            onChange={(e) => {
              setLotId(e.target.value);
              try {
                localStorage.setItem("ovinos-inventory-lot", e.target.value);
              } catch {}
            }}
          >
            <option value="">Sem lote</option>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <details>
          <summary className="cursor-pointer text-sm font-medium text-[var(--primary)]">Foto e observações</summary>
          <div className="mt-3 space-y-3">
            <PhotoInput value={photo} onChange={setPhoto} />
            <Field label="Observações">
              <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: mancha na orelha, manca…" />
            </Field>
          </div>
        </details>
        <FormError error={error} />
        <button className="btn btn-primary btn-lg w-full" disabled={busy || !!dup}>
          {busy ? "Salvando…" : "Salvar e próximo →"}
        </button>
      </form>

      {session.length > 0 && (
        <div className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Resumo desta sessão</h2>
            <button
              type="button"
              className="text-xs text-[var(--muted)] underline"
              onClick={() => {
                if (confirm("Limpar a lista desta sessão? (Os cadastros não são apagados.)")) setSession([]);
              }}
            >
              limpar lista
            </button>
          </div>
          <div className="mb-3 flex flex-wrap gap-1">
            {Object.entries(summary).map(([k, v]) => (
              <span key={k} className="badge badge-info">
                {k}: {v}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {session.map((s, i) => (
              <span key={i} className={cx("badge", s.queued ? "badge-warn" : "badge-good")} title={s.queued ? "aguardando sinal" : "enviado"}>
                {s.tag}
              </span>
            ))}
          </div>
          <Link href="/inventario/resumo" className="btn btn-secondary mt-3 w-full">
            Ver resumo completo por categoria
          </Link>
        </div>
      )}
    </div>
  );
}
