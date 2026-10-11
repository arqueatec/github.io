"use client";
import { useState } from "react";
import { Field, FormError, todayLocal, useSubmit } from "@/components/forms";

export function NewCountForm({ lots }: { lots: { id: number; name: string }[] }) {
  const [date, setDate] = useState(todayLocal());
  const [lotId, setLotId] = useState("");
  const { submit, busy, error } = useSubmit<{ id: number }>();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit("POST", "/api/counts", { date, lotId: lotId ? Number(lotId) : null }, {
          onSuccess: (d) => d && (window.location.href = `/inventario/recontagem/${d.id}`),
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data">
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Abrangência">
          <select className="select" value={lotId} onChange={(e) => setLotId(e.target.value)}>
            <option value="">Rebanho inteiro</option>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <FormError error={error} />
      <button className="btn btn-primary w-full" disabled={busy}>
        Iniciar recontagem
      </button>
    </form>
  );
}
