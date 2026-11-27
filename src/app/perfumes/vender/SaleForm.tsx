"use client";
import { useState } from "react";
import { Field, FormError, MoneyInput, SubmitBar, todayLocal, useSubmit } from "@/components/forms";
import { formatCents } from "@/domain/money";

type P = { id: number; name: string; stock: number; priceCents: number };
type U = { id: number; name: string };

export function SaleForm({ perfumes, sellers, currentUserId, currentIsSeller }: { perfumes: P[]; sellers: U[]; currentUserId: number; currentIsSeller: boolean }) {
  const [perfumeId, setPerfumeId] = useState("");
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState<number | null>(null);
  const [date, setDate] = useState(todayLocal());
  const [soldBy, setSoldBy] = useState(currentIsSeller ? String(currentUserId) : "");
  const [notes, setNotes] = useState("");
  const { submit, busy, error } = useSubmit<{ id: number }>();

  const p = perfumes.find((x) => String(x.id) === perfumeId);
  const total = unit != null && qty > 0 ? unit * qty : null;
  const semEstoque = p ? qty > p.stock : false;
  const invalid = !p || qty < 1 || unit == null || semEstoque;

  function pick(id: string) {
    setPerfumeId(id);
    const found = perfumes.find((x) => String(x.id) === id);
    if (found) setUnit(found.priceCents);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (invalid) return;
        void submit(
          "POST",
          "/api/perfumes/sell",
          { perfumeId: Number(perfumeId), qty, unitCents: unit, date, soldByUserId: soldBy ? Number(soldBy) : null, notes },
          { offline: `Venda ${p?.name ?? ""}`, success: "Venda registrada", redirect: "/perfumes" },
        );
      }}
    >
      <div className="card space-y-4">
        <Field label="Perfume *">
          <select className="select" value={perfumeId} onChange={(e) => pick(e.target.value)} required autoFocus>
            <option value="">Escolha</option>
            {perfumes.map((x) => (
              <option key={x.id} value={x.id} disabled={x.stock <= 0}>
                {x.name} — {x.stock} em estoque{x.stock <= 0 ? " (esgotado)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantidade *" error={semEstoque ? `Só há ${p?.stock} em estoque` : null}>
            <input type="number" inputMode="numeric" min={1} className="input" value={qty} onChange={(e) => setQty(Math.max(1, Math.trunc(Number(e.target.value) || 1)))} required />
          </Field>
          <Field label="Preço unitário *" hint={p ? `Preço cadastrado: ${formatCents(p.priceCents)}` : undefined}>
            <MoneyInput cents={unit} onChange={setUnit} required />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data">
            <input type="date" className="input" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Quem vendeu (opcional)">
            <select className="select" value={soldBy} onChange={(e) => setSoldBy(e.target.value)}>
              <option value="">Não informar</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Observação (opcional)">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: cliente, forma de pagamento" />
        </Field>
        {total != null && !semEstoque && (
          <p className="rounded-lg bg-[var(--good-bg)] p-3 text-sm text-[var(--good)]">
            Total da venda: <strong>{formatCents(total)}</strong> ({qty}× {unit != null ? formatCents(unit) : ""})
          </p>
        )}
      </div>
      <FormError error={error} />
      <SubmitBar busy={busy} disabled={invalid} label="Registrar venda" />
    </form>
  );
}
