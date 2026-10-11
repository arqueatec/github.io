"use client";
import { useState } from "react";
import { Field, FormError, Segmented, SubmitBar, TagInput, TagListInput, todayLocal, useSubmit } from "@/components/forms";

type Ewe = { tag: string; category: string; lotId: number | null; lotName: string | null };

export function BreedingForm({ ewes, initialEwes }: { ewes: Ewe[]; initialEwes: string[] }) {
  const [date, setDate] = useState(todayLocal());
  const [endDate, setEndDate] = useState("");
  const [ramTag, setRamTag] = useState("");
  const [eweTags, setEweTags] = useState<string[]>(initialEwes);
  const [method, setMethod] = useState<"monta_natural" | "monta_controlada" | "inseminacao">("monta_natural");
  const [seasonName, setSeasonName] = useState("");
  const [notes, setNotes] = useState("");
  const { submit, busy, error } = useSubmit();
  const lots = [...new Map(ewes.filter((e) => e.lotId).map((e) => [e.lotId, e.lotName])).entries()];
  const addMany = (list: Ewe[]) => setEweTags((cur) => [...new Set([...cur, ...list.map((e) => e.tag)])]);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit("POST", "/api/breedings", { date, endDate, ramTag, eweTags, method, seasonName, notes }, {
          offline: `Cobertura de ${eweTags.length} matriz(es)`,
          success: `Cobertura registrada para ${eweTags.length} matriz(es)`,
          onSuccess: () => setEweTags([]),
        });
      }}
    >
      <div className="card space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data (início)">
            <input type="date" className="input" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Fim da estação" hint="Opcional">
            <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Reprodutor">
          <TagInput value={ramTag} onChange={setRamTag} filter={(t) => t.sex === "M" && t.status === "ativo"} placeholder="Brinco do reprodutor" />
        </Field>
        <Field label="Método">
          <Segmented value={method} onChange={setMethod} options={[{ value: "monta_natural", label: "Monta natural" }, { value: "monta_controlada", label: "Controlada" }, { value: "inseminacao", label: "IA" }]} />
        </Field>
        <Field label="Matrizes">
          <TagListInput values={eweTags} onChange={setEweTags} filter={(t) => t.sex === "F" && t.status === "ativo"} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => addMany(ewes.filter((e) => e.category === "matriz"))}>
            + Todas as matrizes ({ewes.filter((e) => e.category === "matriz").length})
          </button>
          {lots.map(([id, name]) => (
            <button key={id} type="button" className="btn btn-secondary btn-sm" onClick={() => addMany(ewes.filter((e) => e.lotId === id && e.category === "matriz"))}>
              + {name}
            </button>
          ))}
        </div>
        <Field label="Nome da estação" hint="Ex.: Estação 2026/2">
          <input className="input" value={seasonName} onChange={(e) => setSeasonName(e.target.value)} />
        </Field>
        <Field label="Observações">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <FormError error={error} />
      <SubmitBar busy={busy} label={`Registrar cobertura (${eweTags.length})`} />
    </form>
  );
}
