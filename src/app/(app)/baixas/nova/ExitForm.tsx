"use client";
import { useState } from "react";
import { Field, FormError, Segmented, SubmitBar, TagInput, todayLocal, useSubmit } from "@/components/forms";

const CAUSES = ["Verminose", "Pneumonia", "Diarreia", "Hipotermia", "Inanição", "Toxemia da prenhez", "Clostridiose", "Picada de cobra", "Ataque de cachorro/predador", "Parto distócico", "Desconhecida"];

export function ExitForm({ initialTag }: { initialTag: string }) {
  const [tag, setTag] = useState(initialTag);
  const [type, setType] = useState<"morte" | "abate" | "consumo_proprio">("morte");
  const [date, setDate] = useState(todayLocal());
  const [cause, setCause] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [notes, setNotes] = useState("");
  const [ignoreWithdrawal, setIgnoreWithdrawal] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const { submit, busy, error } = useSubmit();
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await submit("POST", "/api/exits", { tag, type, date, cause, weightKg: weightKg.replace(",", ".") || null, notes, ignoreWithdrawal }, {
          offline: `Baixa (${type}) de ${tag}`,
          success: `Baixa de ${tag} registrada`,
          onSuccess: () => {
            setTag("");
            setCause("");
            setWeightKg("");
            setNeedsConfirm(false);
            setIgnoreWithdrawal(false);
          },
        });
        if (!r) setNeedsConfirm(true);
      }}
    >
      <div className="card space-y-4">
        <Field label="Animal">
          <TagInput value={tag} onChange={setTag} filter={(t) => t.status === "ativo"} required autoFocus={!initialTag} />
        </Field>
        <Field label="Tipo de baixa">
          <Segmented value={type} onChange={setType} options={[{ value: "morte", label: "Morte" }, { value: "abate", label: "Abate" }, { value: "consumo_proprio", label: "Consumo" }]} />
        </Field>
        <Field label="Data">
          <input type="date" className="input" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={type === "morte" ? "Causa da morte *" : "Motivo"}>
          <input className="input" value={cause} onChange={(e) => setCause(e.target.value)} list="causes" required={type === "morte"} />
          <datalist id="causes">
            {CAUSES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Peso (kg)" hint="Opcional">
          <input className="input" inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
        </Field>
        <Field label="Observações">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {type !== "morte" && (needsConfirm || ignoreWithdrawal) && (
          <label className="flex items-start gap-2 rounded-lg bg-[var(--warn-bg)] p-3 text-sm text-[var(--warn)]">
            <input type="checkbox" checked={ignoreWithdrawal} onChange={(e) => setIgnoreWithdrawal(e.target.checked)} className="mt-1" />
            Estou ciente da carência do medicamento e quero registrar mesmo assim.
          </label>
        )}
      </div>
      <FormError error={error} />
      <SubmitBar busy={busy} label="Registrar baixa" />
    </form>
  );
}

