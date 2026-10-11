"use client";
import { useState } from "react";
import { Field, FormError, Segmented, SubmitBar, TagInput, todayLocal, useSubmit } from "@/components/forms";
import { addLocalTag, findTag, useTags } from "@/lib/client/tags";
import { BIRTH_TYPE_LABEL } from "@/lib/labels";

type Lamb = { tag: string; sex: "M" | "F"; weightKg: string };

function Stepper({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-secondary min-w-12 text-xl" onClick={() => onChange(Math.max(0, value - 1))} aria-label={`Diminuir ${label}`}>
          −
        </button>
        <span className="w-10 text-center text-2xl font-bold tabular-nums">{value}</span>
        <button type="button" className="btn btn-secondary min-w-12 text-xl" onClick={() => onChange(Math.min(6, value + 1))} aria-label={`Aumentar ${label}`}>
          +
        </button>
      </div>
    </div>
  );
}

export function BirthForm({ initialEwe, lots }: { initialEwe: string; lots: { id: number; name: string }[] }) {
  const tags = useTags();
  const [eweTag, setEweTag] = useState(initialEwe);
  const [ramTag, setRamTag] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [bornAlive, setBornAlive] = useState(1);
  const [bornDead, setBornDead] = useState(0);
  const [birthType, setBirthType] = useState("normal");
  const [lambs, setLambs] = useState<Lamb[]>([{ tag: "", sex: "F", weightKg: "" }]);
  const [lotId, setLotId] = useState("");
  const [notes, setNotes] = useState("");
  const { submit, busy, error, setError } = useSubmit();

  const setAlive = (n: number) => {
    setBornAlive(n);
    setLambs((cur) => {
      const next = cur.slice(0, n);
      while (next.length < n) next.push({ tag: "", sex: "F", weightKg: "" });
      return next;
    });
  };
  const upd = (i: number, patch: Partial<Lamb>) => setLambs((cur) => cur.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const tagged = lambs.filter((l) => l.tag.trim());
        const dup = tagged.find((l) => findTag(tags, l.tag));
        if (dup) return setError(`Brinco ${dup.tag} já cadastrado`);
        void submit(
          "POST",
          "/api/births",
          {
            eweTag,
            ramTag,
            date,
            bornAlive,
            bornDead,
            birthType,
            lotId: lotId ? Number(lotId) : null,
            notes,
            lambs: tagged.map((l) => ({ tag: l.tag.trim(), sex: l.sex, weightKg: l.weightKg.replace(",", ".") || null })),
          },
          {
            offline: `Parto de ${eweTag}`,
            success: `Parto de ${eweTag} registrado`,
            onSuccess: () => {
              for (const l of tagged) addLocalTag({ tag: l.tag.trim(), sex: l.sex, category: "cordeiro", status: "ativo" });
              setEweTag("");
              setLambs([{ tag: "", sex: "F", weightKg: "" }]);
              setBornAlive(1);
              setBornDead(0);
              setNotes("");
            },
          },
        );
      }}
    >
      <div className="card space-y-4">
        <Field label="Matriz">
          <TagInput value={eweTag} onChange={setEweTag} filter={(t) => t.sex === "F" && t.status === "ativo"} required autoFocus={!initialEwe} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data do parto">
            <input type="date" className="input" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Reprodutor" hint="Vazio = da última cobertura">
            <TagInput value={ramTag} onChange={setRamTag} filter={(t) => t.sex === "M"} placeholder="Opcional" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stepper label="Nascidas vivas" value={bornAlive} onChange={setAlive} />
          <Stepper label="Nascidas mortas" value={bornDead} onChange={setBornDead} />
        </div>
        <Field label="Tipo de parto">
          <Segmented value={birthType} onChange={setBirthType} options={Object.entries(BIRTH_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
        </Field>
      </div>
      {bornAlive > 0 && (
        <div className="card space-y-3">
          <h2 className="font-semibold">Crias nascidas vivas</h2>
          <p className="text-xs text-[var(--muted)]">Deixe o brinco vazio se a cria ainda não foi brincada (ela conta nos índices, mas não ganha ficha).</p>
          {lambs.map((l, i) => {
            const dup = l.tag.trim() && findTag(tags, l.tag);
            return (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg bg-[var(--surface-2)] p-2">
                <input className={`input ${dup ? "input-warn" : ""}`} placeholder={`Brinco da cria ${i + 1}`} value={l.tag} onChange={(e) => upd(i, { tag: e.target.value })} autoCapitalize="characters" />
                <div className="segmented w-28">
                  {(["F", "M"] as const).map((s) => (
                    <button type="button" key={s} className={l.sex === s ? "active" : ""} onClick={() => upd(i, { sex: s })}>
                      {s === "F" ? "♀" : "♂"}
                    </button>
                  ))}
                </div>
                <input className="input col-span-2" inputMode="decimal" placeholder="Peso ao nascer (kg) — opcional" value={l.weightKg} onChange={(e) => upd(i, { weightKg: e.target.value })} />
                {dup && <span className="field-error col-span-2">Brinco já cadastrado</span>}
              </div>
            );
          })}
          <Field label="Lote das crias" hint="Padrão: lote da mãe">
            <select className="select" value={lotId} onChange={(e) => setLotId(e.target.value)}>
              <option value="">Mesmo da mãe</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      <div className="card">
        <Field label="Observações">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <FormError error={error} />
      <SubmitBar busy={busy} label="Registrar parto" />
    </form>
  );
}
