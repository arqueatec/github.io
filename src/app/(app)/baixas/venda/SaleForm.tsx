"use client";
import { useState } from "react";
import { Field, FormError, MoneyInput, Segmented, SubmitBar, TagListInput, todayLocal, useSubmit } from "@/components/forms";
import { formatCents, mulFrac } from "@/domain/money";

type U = { id: number; name: string; party: "A" | "B" };

export function SaleForm({ users, currentUserId, initialTags }: { users: U[]; currentUserId: number; initialTags: string[] }) {
  const [date, setDate] = useState(todayLocal());
  const [buyer, setBuyer] = useState("");
  const [priceMode, setPriceMode] = useState<"kg" | "cabeca">("kg");
  const [unit, setUnit] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [createRevenue, setCreateRevenue] = useState(true);
  const [receivedBy, setReceivedBy] = useState(String(currentUserId));
  const [notes, setNotes] = useState("");
  const [ignoreWithdrawal, setIgnoreWithdrawal] = useState(false);
  const { submit, busy, error } = useSubmit<{ totalCents: number }>();
  const kg = (t: string) => Number((weights[t] ?? "").replace(",", ".")) || 0;
  const total = unit ? tags.reduce((s, t) => s + (priceMode === "kg" ? mulFrac(unit, Math.round(kg(t) * 1000), 1000) : unit), 0) : 0;
  const totalKg = tags.reduce((s, t) => s + kg(t), 0);
  const receiver = users.find((u) => String(u.id) === receivedBy);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(
          "POST",
          "/api/sales",
          {
            date,
            buyer,
            priceMode,
            unitPriceCents: unit,
            items: tags.map((t) => ({ tag: t, weightKg: weights[t]?.replace(",", ".") || null })),
            createRevenue,
            receivedByUserId: Number(receivedBy),
            notes,
            ignoreWithdrawal,
          },
          {
            offline: `Venda de ${tags.length} animal(is) para ${buyer}`,
            success: `Venda registrada: ${formatCents(total)}`,
            redirect: "/baixas?type=venda",
          },
        );
      }}
    >
      <div className="card space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data">
            <input type="date" className="input" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Comprador *">
            <input className="input" value={buyer} onChange={(e) => setBuyer(e.target.value)} required />
          </Field>
        </div>
        <Field label="Preço">
          <Segmented value={priceMode} onChange={setPriceMode} options={[{ value: "kg", label: "Por kg (peso vivo)" }, { value: "cabeca", label: "Por cabeça" }]} />
        </Field>
        <Field label={priceMode === "kg" ? "Preço por kg" : "Preço por cabeça"}>
          <MoneyInput cents={unit} onChange={setUnit} required />
        </Field>
        <Field label="Animais vendidos">
          <TagListInput
            values={tags}
            onChange={setTags}
            filter={(t) => t.status === "ativo"}
            extra={(t) => (
              <input
                className="input min-h-9 w-20 py-0 text-sm"
                inputMode="decimal"
                placeholder="kg"
                aria-label={`Peso de ${t}`}
                required={priceMode === "kg"}
                value={weights[t] ?? ""}
                onChange={(e) => setWeights({ ...weights, [t]: e.target.value })}
              />
            )}
          />
        </Field>
        <div className="rounded-lg bg-[var(--surface-2)] p-3 text-sm">
          <div className="flex justify-between">
            <span>{tags.length} animal(is){totalKg ? ` · ${totalKg.toLocaleString("pt-BR")} kg` : ""}</span>
            <b className="text-lg">{formatCents(total)}</b>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={createRevenue} onChange={(e) => setCreateRevenue(e.target.checked)} /> Lançar a receita da venda
        </label>
        {createRevenue && (
          <Field label="Quem recebeu o dinheiro" hint={receiver ? `Parte ${receiver.party} — ela passa a dever à outra parte a fração dela.` : undefined}>
            <select className="select" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} (Parte {u.party})
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Observações">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <label className="flex items-start gap-2 text-xs text-[var(--muted)]">
          <input type="checkbox" checked={ignoreWithdrawal} onChange={(e) => setIgnoreWithdrawal(e.target.checked)} className="mt-0.5" />
          Prosseguir mesmo se algum animal estiver em carência de medicamento
        </label>
      </div>
      <FormError error={error} />
      <SubmitBar busy={busy || !tags.length} label="Registrar venda" />
    </form>
  );
}
