"use client";
import { useState } from "react";
import { Field, FormError, SubmitBar, todayLocal, useSubmit } from "@/components/forms";
import { Empty } from "@/components/ui";
import { ageLabel } from "@/domain/dates";

export function WeaningForm({ lambs }: { lambs: { tag: string; sex: "M" | "F"; birthDate: string | null }[] }) {
  const [date, setDate] = useState(todayLocal());
  const [sel, setSel] = useState<Record<string, { on: boolean; kg: string }>>({});
  const { submit, busy, error } = useSubmit();
  const items = Object.entries(sel).filter(([, v]) => v.on);
  if (!lambs.length) return <Empty>Nenhuma cria (cordeiro/cordeira ativa) aguardando desmame.</Empty>;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit("POST", "/api/weanings", { date, items: items.map(([tag, v]) => ({ tag, weightKg: v.kg.replace(",", ".") || null })) }, {
          offline: `Desmame de ${items.length} cria(s)`,
          success: `${items.length} desmame(s) registrado(s)`,
          onSuccess: () => setSel({}),
        });
      }}
    >
      <div className="card space-y-3">
        <Field label="Data do desmame">
          <input type="date" className="input" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setSel(Object.fromEntries(lambs.map((l) => [l.tag, { on: true, kg: sel[l.tag]?.kg ?? "" }])))}
        >
          Selecionar todas
        </button>
        <ul className="space-y-2">
          {lambs.map((l) => {
            const v = sel[l.tag] ?? { on: false, kg: "" };
            return (
              <li key={l.tag} className="chip-row">
                <label className="flex flex-1 items-center gap-2">
                  <input type="checkbox" className="h-5 w-5" checked={v.on} onChange={(e) => setSel({ ...sel, [l.tag]: { ...v, on: e.target.checked } })} />
                  <span className="font-semibold">{l.tag}</span>
                  <span className="text-xs text-[var(--muted)]">
                    {l.sex} · {ageLabel(l.birthDate, date)}
                  </span>
                </label>
                <input
                  className="input min-h-10 w-24"
                  inputMode="decimal"
                  placeholder="kg"
                  value={v.kg}
                  onChange={(e) => setSel({ ...sel, [l.tag]: { on: true, kg: e.target.value } })}
                />
              </li>
            );
          })}
        </ul>
      </div>
      <FormError error={error} />
      <SubmitBar busy={busy || !items.length} label={`Registrar desmame (${items.length})`} />
    </form>
  );
}
