"use client";
import { useState } from "react";
import { Field, FormError, MoneyInput, SubmitBar, todayLocal, useSubmit } from "@/components/forms";
import { formatCents } from "@/domain/money";

type P = { id: number; name: string; stock: number; costCents: number };

export function RestockForm({ perfumes }: { perfumes: P[] }) {
  const [perfumeId, setPerfumeId] = useState("");
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState<number | null>(null);
  const [date, setDate] = useState(todayLocal());
  const [notes, setNotes] = useState("");
  const { submit, busy, error } = useSubmit<{ id: number }>();

  const p = perfumes.find((x) => String(x.id) === perfumeId);
  const total = unit != null && qty > 0 ? unit * qty : null;
  const invalid = !p || qty < 1 || unit == null;

  function pick(id: string) {
    setPerfumeId(id);
    const found = perfumes.find((x) => String(x.id) === id);
    if (found) setUnit(found.costCents);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (invalid) return;
        void submit(
          "POST",
          "/api/perfumes/restock",
          { perfumeId: Number(perfumeId), qty, unitCents: unit, date, notes },
          { offline: `Compra ${p?.name ?? ""}`, success: "Estoque reposto", redirect: "/perfumes/produtos" },
        );
      }}
    >
      <div className="card space-y-4">
        <Field label="Perfume *">
          <select className="select" value={perfumeId} onChange={(e) => pick(e.target.value)} required autoFocus>
            <option value="">Escolha</option>
            {perfumes.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} — {x.stock} em estoque
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantidade comprada *">
            <input type="number" inputMode="numeric" min={1} className="input" value={qty} onChange={(e) => setQty(Math.max(1, Math.trunc(Number(e.target.value) || 1)))} required />
          </Field>
          <Field label="Custo unitário *" hint={p ? `Custo cadastrado: ${formatCents(p.costCents)}` : undefined}>
            <MoneyInput cents={unit} onChange={setUnit} required />
          </Field>
        </div>
        <Field label="Data">
          <input type="date" className="input" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Observação (opcional)">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: fornecedor" />
        </Field>
        {total != null && (
          <p className="rounded-lg bg-[var(--info-bg)] p-3 text-sm text-[var(--info)]">
            Total da compra: <strong>{formatCents(total)}</strong> — entra {qty} un. no estoque e sai do caixa.
          </p>
        )}
      </div>
      <FormError error={error} />
      <SubmitBar busy={busy} disabled={invalid} label="Registrar compra" />
    </form>
  );
}
