"use client";
import { useState } from "react";
import { DeleteButton, Field, FormError, MoneyInput, PhotoInput, SubmitBar, TagInput, todayLocal, useSubmit } from "./forms";
import { formatCents, mulFrac } from "@/domain/money";

type U = { id: number; name: string; party: "A" | "B" };
type Opt = { id: number; name: string };

export interface EntryInitial {
  id: number;
  date: string;
  amountCents: number;
  categoryId: number;
  description: string | null;
  userId: number;
  animalTag?: string | null;
  lotId: number | null;
  receiptId: number | null;
}

/** Formulário de despesa ou receita (criação e edição). */
export function EntryForm({
  kind,
  users,
  categories,
  lots,
  currentUserId,
  lockedUntil,
  share,
  initial,
}: {
  kind: "despesa" | "receita";
  users: U[];
  categories: Opt[];
  lots: Opt[];
  currentUserId: number;
  lockedUntil: string | null;
  share: { num: number; den: number };
  initial?: EntryInitial;
}) {
  const [date, setDate] = useState(initial?.date ?? todayLocal());
  const [amount, setAmount] = useState<number | null>(initial?.amountCents ?? null);
  const [categoryId, setCategoryId] = useState(initial ? String(initial.categoryId) : "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [userId, setUserId] = useState(String(initial?.userId ?? currentUserId));
  const [animalTag, setAnimalTag] = useState(initial?.animalTag ?? "");
  const [lotId, setLotId] = useState(initial?.lotId ? String(initial.lotId) : "");
  const [receipt, setReceipt] = useState<{ mime: "image/jpeg"; base64: string } | null>(null);
  const [removeReceipt, setRemoveReceipt] = useState(false);
  const { submit, busy, error } = useSubmit<{ id: number }>();
  const isExp = kind === "despesa";
  const base = isExp ? "/api/expenses" : "/api/revenues";
  const list = isExp ? "/financeiro/despesas" : "/financeiro/receitas";
  const who = users.find((u) => String(u.id) === userId);
  const locked = lockedUntil && date <= lockedUntil;
  // prévia do efeito no saldo
  let preview = "";
  if (amount && who) {
    const a = mulFrac(amount, share.num, share.den);
    const b = amount - a;
    if (isExp) preview = who.party === "A" ? `Parte B passa a dever ${formatCents(b)} à Parte A` : `Parte A passa a dever ${formatCents(a)} à Parte B`;
    else preview = who.party === "A" ? `Parte A passa a dever ${formatCents(b)} à Parte B` : `Parte B passa a dever ${formatCents(a)} à Parte A`;
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const body: Record<string, unknown> = {
          date,
          amountCents: amount,
          categoryId: Number(categoryId),
          description,
          lotId: lotId ? Number(lotId) : null,
          receipt,
          [isExp ? "paidByUserId" : "receivedByUserId"]: Number(userId),
        };
        if (isExp) body.animalTag = animalTag || null;
        if (initial) {
          body.removeReceipt = removeReceipt;
          void submit("PATCH", `${base}/${initial.id}`, body, { success: "Lançamento atualizado", redirect: list });
        } else {
          void submit("POST", base, body, {
            offline: `${isExp ? "Despesa" : "Receita"} ${amount ? formatCents(amount) : ""}`,
            success: `${isExp ? "Despesa" : "Receita"} lançada`,
            redirect: list,
          });
        }
      }}
    >
      <div className="card space-y-4">
        <Field label="Valor *">
          <MoneyInput cents={amount} onChange={setAmount} required autoFocus={!initial} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data" error={locked ? `Período fechado até ${lockedUntil}` : null}>
            <input type="date" className="input" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Categoria *">
            <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              <option value="">Escolha</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={isExp ? "Quem pagou" : "Quem recebeu"} hint={who ? `Parte ${who.party} (derivada do usuário)` : undefined}>
          <select className="select" value={userId} onChange={(e) => setUserId(e.target.value)}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} — Parte {u.party}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Descrição">
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={isExp ? "Ex.: 2 sacos de sal mineral" : "Ex.: venda de 40 kg de lã"} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {isExp && (
            <Field label="Animal (opcional)">
              <TagInput value={animalTag} onChange={setAnimalTag} placeholder="Brinco" />
            </Field>
          )}
          <Field label="Lote (opcional)">
            <select className="select" value={lotId} onChange={(e) => setLotId(e.target.value)}>
              <option value="">Geral</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <PhotoInput value={receipt} onChange={setReceipt} label="Comprovante (foto)" />
        {initial?.receiptId && !receipt && (
          <div className="flex items-center gap-3 text-sm">
            <a className="link" href={`/api/attachments/${initial.receiptId}`} target="_blank" rel="noreferrer">
              Ver comprovante atual
            </a>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={removeReceipt} onChange={(e) => setRemoveReceipt(e.target.checked)} /> remover
            </label>
          </div>
        )}
        {preview && (
          <p className="rounded-lg bg-[var(--info-bg)] p-3 text-sm text-[var(--info)]">
            Rateio {share.num}/{share.den} – {share.den - share.num}/{share.den}: {preview}.
          </p>
        )}
      </div>
      <FormError error={error} />
      <SubmitBar busy={busy || !!locked} label={initial ? "Salvar alterações" : "Lançar"}>
        {initial && <DeleteButton url={`${base}/${initial.id}`} redirect={list} confirmText="Excluir este lançamento? Fica registrado na auditoria." />}
      </SubmitBar>
    </form>
  );
}
