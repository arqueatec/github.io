"use client";
import { useState } from "react";
import { DeleteButton, Field, FormError, MoneyInput, Segmented, SubmitBar, todayLocal, useSubmit } from "./forms";
import { METHOD_LABEL } from "@/lib/labels";
import { formatCents } from "@/domain/money";

type U = { id: number; name: string; party: "A" | "B" };

export function ReimbursementForm({
  users,
  currentUserId,
  balance,
  lockedUntil,
  initial,
}: {
  users: U[];
  currentUserId: number;
  balance: number;
  lockedUntil: string | null;
  initial?: { id: number; date: string; amountCents: number; fromParty: "A" | "B"; paidByUserId: number; method: string; notes: string | null };
}) {
  // sugestão: quem deve paga o saldo
  const debtor: "A" | "B" = balance > 0 ? "B" : "A";
  const [fromParty, setFromParty] = useState<"A" | "B">(initial?.fromParty ?? debtor);
  const [amount, setAmount] = useState<number | null>(initial?.amountCents ?? (Math.abs(balance) || null));
  const [date, setDate] = useState(initial?.date ?? todayLocal());
  const [method, setMethod] = useState(initial?.method ?? "pix");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const partyUsers = users.filter((u) => u.party === fromParty);
  const [paidBy, setPaidBy] = useState(String(initial?.paidByUserId ?? (partyUsers.find((u) => u.id === currentUserId) ?? partyUsers[0])?.id ?? ""));
  const { submit, busy, error } = useSubmit();
  const locked = lockedUntil && date <= lockedUntil;
  const after = amount ? balance + (fromParty === "B" ? -amount : amount) : balance;
  const desc = (b: number) => (b === 0 ? "contas acertadas" : b > 0 ? `Parte B deve ${formatCents(b)} à Parte A` : `Parte A deve ${formatCents(-b)} à Parte B`);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const body = { date, amountCents: amount, fromParty, paidByUserId: Number(paidBy), method, notes };
        if (initial) void submit("PATCH", `/api/reimbursements/${initial.id}`, body, { success: "Reembolso atualizado", redirect: "/financeiro/reembolsos" });
        else void submit("POST", "/api/reimbursements", body, { offline: `Reembolso ${amount ? formatCents(amount) : ""}`, success: "Reembolso lançado", redirect: "/financeiro/extrato" });
      }}
    >
      <div className="card space-y-4">
        {!initial && <p className="rounded-lg bg-[var(--surface-2)] p-3 text-sm">Saldo atual: <b>{desc(balance)}</b></p>}
        <Field label="Quem paga o reembolso">
          <Segmented
            value={fromParty}
            onChange={(v) => {
              setFromParty(v);
              const first = users.find((u) => u.party === v);
              setPaidBy(String((users.find((u) => u.party === v && u.id === currentUserId) ?? first)?.id ?? ""));
            }}
            options={[{ value: "B", label: "Parte B → Parte A" }, { value: "A", label: "Parte A → Parte B" }]}
          />
        </Field>
        <Field label="Pago por">
          <select className="select" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            {partyUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Valor">
          <MoneyInput cents={amount} onChange={setAmount} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data" error={locked ? `Período fechado até ${lockedUntil}` : null}>
            <input type="date" className="input" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Forma de pagamento">
            <select className="select" value={method} onChange={(e) => setMethod(e.target.value)}>
              {Object.entries(METHOD_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Observações">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {!initial && amount ? <p className="rounded-lg bg-[var(--info-bg)] p-3 text-sm text-[var(--info)]">Depois deste reembolso: {desc(after)}.</p> : null}
      </div>
      <FormError error={error} />
      <SubmitBar busy={busy || !!locked} label={initial ? "Salvar" : "Lançar reembolso"}>
        {initial && <DeleteButton url={`/api/reimbursements/${initial.id}`} redirect="/financeiro/reembolsos" />}
      </SubmitBar>
    </form>
  );
}
