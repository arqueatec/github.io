"use client";
import { useState } from "react";
import { Field, FormError, todayLocal, useSubmit } from "@/components/forms";
import { formatCents } from "@/domain/money";

type U = { id: number; name: string; party: "A" | "B" };

export function PayButton({ id, amount, users, dueDate }: { id: number; amount: number; users: U[]; dueDate: string | null }) {
  const [open, setOpen] = useState(false);
  const [paidByUserId, setPaidByUserId] = useState(String(users[0]?.id ?? ""));
  const [date, setDate] = useState(todayLocal());
  const { submit, busy, error } = useSubmit();
  const who = users.find((u) => String(u.id) === paidByUserId);
  if (!open)
    return (
      <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        Marcar paga
      </button>
    );
  return (
    <div className="relative inline-block">
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(false)}>
        Marcar paga
      </button>
      <div className="absolute right-0 z-20 mt-1 w-72 max-w-[85vw] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left shadow-xl">
      <p className="mb-2 text-sm font-semibold">Pagar {formatCents(amount)}</p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit("POST", `/api/expenses/${id}/pay`, { paidByUserId: Number(paidByUserId), date }, {
            success: "Conta paga — agora entra no acerto",
          });
        }}
      >
        <Field label="Quem pagou" hint={who ? `Parte ${who.party}` : undefined}>
          <select className="select" value={paidByUserId} onChange={(e) => setPaidByUserId(e.target.value)}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} — Parte {u.party}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Data do pagamento" hint={dueDate ? `Vencimento: ${dueDate.split("-").reverse().join("/")}` : undefined}>
          <input type="date" className="input" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <FormError error={error} />
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary btn-sm flex-1" onClick={() => setOpen(false)}>
            Cancelar
          </button>
          <button className="btn btn-primary btn-sm flex-1" disabled={busy}>
            Confirmar
          </button>
        </div>
      </form>
      </div>
    </div>
  );
}
