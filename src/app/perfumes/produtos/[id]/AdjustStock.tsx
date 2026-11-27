"use client";
import { useState } from "react";
import { Field, FormError, SubmitBar, todayLocal, useSubmit } from "@/components/forms";

export function AdjustStock({ id, current }: { id: number; current: number }) {
  const [stock, setStock] = useState(current);
  const [date, setDate] = useState(todayLocal());
  const { submit, busy, error } = useSubmit();
  const delta = stock - current;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit("POST", "/api/perfumes/adjust", { perfumeId: id, stock, date }, { success: "Estoque ajustado" });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Estoque conferido" hint={delta !== 0 ? `${delta > 0 ? "+" : ""}${delta} em relação ao sistema` : "igual ao sistema"}>
          <input type="number" inputMode="numeric" min={0} className="input" value={stock} onChange={(e) => setStock(Math.max(0, Math.trunc(Number(e.target.value) || 0)))} />
        </Field>
        <Field label="Data">
          <input type="date" className="input" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <FormError error={error} />
      <SubmitBar busy={busy} disabled={delta === 0} label="Ajustar estoque" />
    </form>
  );
}
