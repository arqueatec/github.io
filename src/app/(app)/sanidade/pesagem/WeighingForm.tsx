"use client";
import { useRef, useState } from "react";
import { Field, FormError, SubmitBar, TagInput, todayLocal, useSubmit } from "@/components/forms";

type Row = { tag: string; weightKg: string; bodyScore: string };

export function WeighingForm({ initialTags }: { initialTags: string[] }) {
  const [date, setDate] = useState(todayLocal());
  const [rows, setRows] = useState<Row[]>(initialTags.map((t) => ({ tag: t, weightKg: "", bodyScore: "" })));
  const [cur, setCur] = useState<Row>({ tag: "", weightKg: "", bodyScore: "" });
  const tagRef = useRef<HTMLInputElement>(null);
  const { submit, busy, error } = useSubmit();
  const addCur = () => {
    if (!cur.tag.trim() || (!cur.weightKg && !cur.bodyScore)) return;
    setRows((r) => [...r.filter((x) => x.tag !== cur.tag.trim()), { ...cur, tag: cur.tag.trim() }]);
    setCur({ tag: "", weightKg: "", bodyScore: "" });
    tagRef.current?.focus();
  };
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const items = rows
          .filter((r) => r.weightKg || r.bodyScore)
          .map((r) => ({ tag: r.tag, weightKg: r.weightKg.replace(",", ".") || null, bodyScore: r.bodyScore.replace(",", ".") || null }));
        void submit("POST", "/api/weighings", { date, items }, { offline: `Pesagem de ${items.length} animal(is)`, success: "Pesagens registradas", onSuccess: () => setRows([]) });
      }}
    >
      <div className="card space-y-3">
        <Field label="Data">
          <input type="date" className="input" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="grid grid-cols-[1fr_6rem_5rem] gap-2" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCur())}>
          <TagInput inputRef={tagRef} value={cur.tag} onChange={(v) => setCur({ ...cur, tag: v })} filter={(t) => t.status === "ativo"} autoFocus />
          <input className="input" inputMode="decimal" placeholder="kg" value={cur.weightKg} onChange={(e) => setCur({ ...cur, weightKg: e.target.value })} />
          <input className="input" inputMode="decimal" placeholder="ECC" value={cur.bodyScore} onChange={(e) => setCur({ ...cur, bodyScore: e.target.value })} />
        </div>
        <button type="button" className="btn btn-secondary w-full" onClick={addCur}>
          Adicionar à lista
        </button>
        <p className="field-hint">ECC = escore de condição corporal de 1 (muito magra) a 5 (obesa).</p>
        {rows.length > 0 && (
          <ul className="space-y-1">
            {rows.map((r, i) => (
              <li key={r.tag} className="chip-row">
                <b>{r.tag}</b>
                <input className="input min-h-9 w-20" inputMode="decimal" value={r.weightKg} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, weightKg: e.target.value } : x)))} placeholder="kg" />
                <input className="input min-h-9 w-16" inputMode="decimal" value={r.bodyScore} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, bodyScore: e.target.value } : x)))} placeholder="ECC" />
                <button type="button" className="ml-auto text-[var(--bad)]" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={`Remover ${r.tag}`}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <FormError error={error} />
      <SubmitBar busy={busy || !rows.length} label={`Salvar ${rows.length} pesagem(ns)`} />
    </form>
  );
}
