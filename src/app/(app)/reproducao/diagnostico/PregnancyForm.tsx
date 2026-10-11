"use client";
import { useState } from "react";
import { Field, FormError, Segmented, SubmitBar, TagInput, todayLocal, useSubmit } from "@/components/forms";

export function PregnancyForm({ initialEwe }: { initialEwe: string }) {
  const [eweTag, setEweTag] = useState(initialEwe);
  const [date, setDate] = useState(todayLocal());
  const [result, setResult] = useState<"prenhe" | "vazia" | "duvidosa">("prenhe");
  const [method, setMethod] = useState("Ultrassom");
  const [fetusCount, setFetusCount] = useState("");
  const { submit, busy, error } = useSubmit();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit("POST", "/api/pregnancy-checks", { eweTag, date, result, method, fetusCount }, {
          offline: `Diagnóstico ${eweTag}`,
          success: `Diagnóstico de ${eweTag} registrado`,
          onSuccess: () => {
            setEweTag("");
            setFetusCount("");
          },
        });
      }}
    >
      <div className="card space-y-4">
        <Field label="Matriz">
          <TagInput value={eweTag} onChange={setEweTag} filter={(t) => t.sex === "F" && t.status === "ativo"} autoFocus required />
        </Field>
        <Field label="Data">
          <input type="date" className="input" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Resultado">
          <Segmented value={result} onChange={setResult} options={[{ value: "prenhe", label: "Prenhe" }, { value: "vazia", label: "Vazia" }, { value: "duvidosa", label: "Duvidosa" }]} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Método">
            <select className="select" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option>Ultrassom</option>
              <option>Palpação</option>
              <option>Observação de retorno ao cio</option>
            </select>
          </Field>
          <Field label="Nº de fetos" hint="Se visto no ultrassom">
            <input className="input" inputMode="numeric" value={fetusCount} onChange={(e) => setFetusCount(e.target.value)} />
          </Field>
        </div>
      </div>
      <FormError error={error} />
      <SubmitBar busy={busy} label="Registrar diagnóstico" />
    </form>
  );
}
