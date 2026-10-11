"use client";
import { useState } from "react";
import { Field, FormError, todayLocal, useSubmit } from "@/components/forms";

export function CloseForm() {
  const [lockedUntil, setLockedUntil] = useState(todayLocal());
  const [notes, setNotes] = useState("");
  const { submit, busy, error } = useSubmit();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm(`Travar todos os lançamentos financeiros até ${lockedUntil}? Só o administrador poderá reabrir.`))
          void submit("POST", "/api/locks", { lockedUntil, notes }, { success: "Período fechado" });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Travar até (inclusive)">
          <input type="date" className="input" value={lockedUntil} max={todayLocal()} onChange={(e) => setLockedUntil(e.target.value)} />
        </Field>
        <Field label="Observação">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: acerto do semestre" />
        </Field>
      </div>
      <FormError error={error} />
      <button className="btn btn-primary w-full" disabled={busy}>
        Fechar período
      </button>
    </form>
  );
}

export function ReopenButton({ id }: { id: number }) {
  const { submit, busy } = useSubmit();
  return (
    <button
      className="btn btn-secondary btn-sm"
      disabled={busy}
      onClick={() => {
        const reason = prompt("Motivo da reabertura (fica na auditoria):");
        if (reason && reason.trim().length >= 3) void submit("POST", `/api/locks/${id}/reopen`, { reason }, { success: "Período reaberto" });
      }}
    >
      Reabrir
    </button>
  );
}
