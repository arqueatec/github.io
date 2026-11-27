"use client";
import { useState } from "react";
import { Field, FormError, MoneyInput, SubmitBar, useSubmit } from "@/components/forms";

export interface PerfumeInitial {
  id: number;
  name: string;
  costCents: number;
  priceCents: number;
  active: boolean;
}

export function PerfumeForm({ initial }: { initial?: PerfumeInitial }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [cost, setCost] = useState<number | null>(initial?.costCents ?? 1300);
  const [price, setPrice] = useState<number | null>(initial?.priceCents ?? 3000);
  const [stock, setStock] = useState(0);
  const [active, setActive] = useState(initial?.active ?? true);
  const { submit, busy, error } = useSubmit<{ id: number }>();
  const invalid = !name.trim() || cost == null || price == null;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (invalid) return;
        const body: Record<string, unknown> = { name: name.trim(), costCents: cost, priceCents: price };
        if (initial) {
          body.active = active;
          void submit("PATCH", `/api/perfumes/${initial.id}`, body, { success: "Perfume atualizado", redirect: "/perfumes/produtos" });
        } else {
          body.stock = stock;
          void submit("POST", "/api/perfumes", body, { success: "Perfume cadastrado", redirect: "/perfumes/produtos" });
        }
      }}
    >
      <div className="card space-y-4">
        <Field label="Nome *">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Invictus" required autoFocus={!initial} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Custo de compra *">
            <MoneyInput cents={cost} onChange={setCost} required />
          </Field>
          <Field label="Preço de venda *">
            <MoneyInput cents={price} onChange={setPrice} required />
          </Field>
        </div>
        {!initial ? (
          <Field label="Estoque inicial" hint="Quantidade atual em mãos. Depois use Vender/Repor para movimentar.">
            <input type="number" inputMode="numeric" min={0} className="input" value={stock} onChange={(e) => setStock(Math.max(0, Math.trunc(Number(e.target.value) || 0)))} />
          </Field>
        ) : (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Ativo (aparece nas vendas)
          </label>
        )}
      </div>
      <FormError error={error} />
      <SubmitBar busy={busy} disabled={invalid} label={initial ? "Salvar" : "Cadastrar perfume"} />
    </form>
  );
}
