"use client";
import { useState } from "react";
import { DeleteButton, Field, FormError, MoneyInput, PhotoInput, Segmented, SubmitBar, TagInput, todayLocal, useSubmit } from "./forms";
import { formatCents, mulFrac } from "@/domain/money";

type U = { id: number; name: string; party: "A" | "B" };
type Opt = { id: number; name: string };
type FinSpecies = "ovino" | "bovino" | "ambos";

export interface EntryInitial {
  id: number;
  date: string;
  amountCents: number;
  categoryId: number;
  description: string | null;
  userId: number | null;
  species: FinSpecies;
  status?: "pago" | "a_pagar";
  dueDate?: string | null;
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
  const [status, setStatus] = useState<"pago" | "a_pagar">(initial?.status ?? "pago");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  // Compra parcelada (só na criação de despesa paga): entrada(s) por parte + N parcelas.
  const [parcelar, setParcelar] = useState(false);
  const [entradas, setEntradas] = useState<{ payerId: string; amount: number | null }[]>([{ payerId: String(currentUserId), amount: null }]);
  const [parcelas, setParcelas] = useState<{ amount: number | null; due: string }[]>([{ amount: null, due: "" }]);
  const [species, setSpecies] = useState<FinSpecies>(initial?.species ?? "ambos");
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
  // Parcelamento válido: criação de despesa paga (entrada opcional + parcelas do saldo).
  const canParcelar = isExp && !initial && status === "pago";
  const parcelando = canParcelar && parcelar;
  const entradaTotal = entradas.reduce((s, e) => s + (e.amount ?? 0), 0);
  const saldo = parcelando && amount != null ? amount - entradaTotal : null;
  const somaParcelas = parcelas.reduce((s, p) => s + (p.amount ?? 0), 0);
  const restante = saldo != null ? saldo - somaParcelas : null;
  const parcelasInvalid =
    parcelando &&
    (amount == null || entradaTotal >= amount || restante !== 0 || parcelas.some((p) => !p.amount || !p.due) || entradas.some((e) => e.amount != null && e.amount > 0 && !e.payerId));
  const distribuirIgual = () => {
    if (saldo == null || saldo <= 0) return;
    const n = parcelas.length;
    const base = Math.floor(saldo / n);
    setParcelas((xs) => xs.map((x, i) => ({ ...x, amount: i === n - 1 ? saldo - base * (n - 1) : base })));
  };
  // valor que de fato afeta o saldo entre as partes (no parcelamento, cada entrada entra pela sua parte)
  const effectAmount = parcelando ? null : amount;
  // prévia do efeito no saldo
  let preview = "";
  if (effectAmount && who) {
    const a = mulFrac(effectAmount, share.num, share.den);
    const b = effectAmount - a;
    if (isExp) preview = who.party === "A" ? `Parte B passa a dever ${formatCents(b)} à Parte A` : `Parte A passa a dever ${formatCents(a)} à Parte B`;
    else preview = who.party === "A" ? `Parte A passa a dever ${formatCents(b)} à Parte B` : `Parte B passa a dever ${formatCents(a)} à Parte A`;
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const payable = isExp && status === "a_pagar";
        const body: Record<string, unknown> = {
          date,
          amountCents: amount,
          categoryId: Number(categoryId),
          description,
          species,
          lotId: lotId ? Number(lotId) : null,
          receipt,
        };
        if (isExp) {
          body.animalTag = animalTag || null;
          if (parcelando) {
            const downs = entradas.filter((e) => e.amount && e.amount > 0 && e.payerId).map((e) => ({ paidByUserId: Number(e.payerId), amountCents: e.amount }));
            body.status = downs.length > 0 ? "pago" : "a_pagar";
            body.paidByUserId = null;
            body.downPayments = downs;
            body.installments = parcelas.filter((p) => p.amount && p.due).map((p) => ({ amountCents: p.amount, dueDate: p.due }));
            body.dueDate = null;
          } else {
            body.status = status;
            body.paidByUserId = payable ? null : Number(userId);
            body.dueDate = payable ? dueDate : null;
          }
        } else {
          body.receivedByUserId = Number(userId);
        }
        const noun = isExp ? (payable ? "Conta a pagar" : "Despesa") : "Receita";
        // Após um lançamento que gera conta pendente (a pagar ou parcelas), leva à lista de contas.
        const toPayables = payable || parcelando;
        if (initial) {
          body.removeReceipt = removeReceipt;
          void submit("PATCH", `${base}/${initial.id}`, body, { success: "Lançamento atualizado", redirect: payable ? "/financeiro/contas-a-pagar" : list });
        } else {
          void submit("POST", base, body, {
            offline: `${noun} ${amount ? formatCents(amount) : ""}`,
            success: parcelando ? "Compra parcelada lançada — parcelas em Contas a pagar" : `${noun} ${payable ? "registrada" : "lançada"}`,
            redirect: toPayables ? "/financeiro/contas-a-pagar" : list,
          });
        }
      }}
    >
      <div className="card space-y-4">
        {isExp && (
          <Field label="Situação">
            <Segmented
              value={status}
              onChange={setStatus}
              options={[
                { value: "pago", label: "✅ Paga agora" },
                { value: "a_pagar", label: "🧾 A pagar (conta)" },
              ]}
            />
          </Field>
        )}
        <Field label={parcelando ? "Valor total *" : "Valor *"}>
          <MoneyInput cents={amount} onChange={setAmount} required autoFocus={!initial} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={isExp && status === "a_pagar" ? "Data do lançamento" : "Data"} error={locked ? `Período fechado até ${lockedUntil}` : null}>
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
        {isExp && status === "a_pagar" ? (
          <Field label="Vencimento *" hint="Quando esta conta precisa ser paga. O pagador é definido ao marcar como paga.">
            <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
          </Field>
        ) : parcelando ? null : (
          <Field label={isExp ? "Quem pagou" : "Quem recebeu"} hint={who ? `Parte ${who.party} (derivada do usuário)` : undefined}>
            <select className="select" value={userId} onChange={(e) => setUserId(e.target.value)}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — Parte {u.party}
                </option>
              ))}
            </select>
          </Field>
        )}
        {canParcelar && (
          <div className="rounded-lg border border-[var(--border)] p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={parcelar} onChange={(e) => setParcelar(e.target.checked)} />
              Compra parcelada (entrada + parcelas)
            </label>
            {parcelar && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="field-label">Entrada paga agora (opcional)</span>
                    {amount != null && <span className="text-xs text-[var(--muted)]">Saldo a parcelar: {formatCents(Math.max(0, (amount ?? 0) - entradaTotal))}</span>}
                  </div>
                  {entradas.map((e, i) => (
                    <div key={i} className="flex gap-2">
                      <select
                        className="select flex-1"
                        value={e.payerId}
                        onChange={(ev) => setEntradas((xs) => xs.map((x, j) => (j === i ? { ...x, payerId: ev.target.value } : x)))}
                        aria-label={`Quem pagou a entrada ${i + 1}`}
                      >
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} — Parte {u.party}
                          </option>
                        ))}
                      </select>
                      <div className="flex-1">
                        <MoneyInput cents={e.amount} onChange={(c) => setEntradas((xs) => xs.map((x, j) => (j === i ? { ...x, amount: c } : x)))} />
                      </div>
                      {entradas.length > 1 && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEntradas((xs) => xs.filter((_, j) => j !== i))} aria-label="Remover entrada">
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEntradas((xs) => [...xs, { payerId: String(currentUserId), amount: null }])}>
                    + entrada (outra parte)
                  </button>
                  <p className="text-xs text-[var(--muted)]">Quem pagou cada parte da entrada. Só a entrada entra no acerto. Deixe sem valor se comprou tudo a prazo.</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="field-label">Parcelas a pagar</span>
                    {saldo != null && restante != null && (
                      <span className={`text-xs font-medium ${restante === 0 ? "text-[var(--good)]" : "text-[var(--bad)]"}`}>
                        {restante === 0 ? "✓ parcelas fecham o saldo" : restante > 0 ? `Falta distribuir ${formatCents(restante)}` : `Passou ${formatCents(-restante)} do saldo`}
                      </span>
                    )}
                  </div>
                  {parcelas.map((p, i) => (
                    <div key={i} className="flex gap-2">
                      <div className="flex-1">
                        <MoneyInput cents={p.amount} onChange={(c) => setParcelas((xs) => xs.map((x, j) => (j === i ? { ...x, amount: c } : x)))} />
                      </div>
                      <input
                        type="date"
                        className="input flex-1"
                        value={p.due}
                        onChange={(e) => setParcelas((xs) => xs.map((x, j) => (j === i ? { ...x, due: e.target.value } : x)))}
                        aria-label={`Vencimento da parcela ${i + 1}`}
                      />
                      {parcelas.length > 1 && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setParcelas((xs) => xs.filter((_, j) => j !== i))} aria-label="Remover parcela">
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setParcelas((xs) => [...xs, { amount: null, due: "" }])}>
                      + parcela
                    </button>
                    {saldo != null && saldo > 0 && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={distribuirIgual}>
                        Dividir o saldo igualmente
                      </button>
                    )}
                  </div>
                </div>
                <p className="rounded-lg bg-[var(--warn-bg)] p-2 text-xs text-[var(--warn)]">
                  As parcelas ficam em Contas a pagar (em aberto, sem parte A/B) até cada uma ser paga.
                </p>
              </>
            )}
          </div>
        )}
        <Field label="A que se refere" hint="Use Geral quando valer para os dois (ex.: sal mineral, mão de obra).">
          <Segmented
            value={species}
            onChange={setSpecies}
            options={[
              { value: "ovino", label: "🐑 Ovelhas" },
              { value: "bovino", label: "🐄 Gado" },
              { value: "ambos", label: "Geral" },
            ]}
          />
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
        {isExp && status === "a_pagar" ? (
          <p className="rounded-lg bg-[var(--warn-bg)] p-3 text-sm text-[var(--warn)]">
            Conta a pagar: não entra no acerto entre as partes enquanto não for paga. Você a encontra em Finanças → Contas a pagar.
          </p>
        ) : (
          preview && (
            <p className="rounded-lg bg-[var(--info-bg)] p-3 text-sm text-[var(--info)]">
              {parcelando && "Sobre a entrada paga agora — "}Rateio {share.num}/{share.den} – {share.den - share.num}/{share.den}: {preview}.
            </p>
          )
        )}
      </div>
      {parcelando && parcelasInvalid && (
        <p className="text-sm text-[var(--bad)]">
          {amount == null
            ? "Informe o valor total."
            : entradaTotal >= amount
              ? "A entrada deve ser menor que o total."
              : restante !== 0
                ? `Ajuste as parcelas: ${restante! > 0 ? `faltam ${formatCents(restante!)}` : `passou ${formatCents(-restante!)}`} para fechar o saldo (total − entrada).`
                : "Preencha valor e vencimento de todas as parcelas."}
        </p>
      )}
      <FormError error={error} />
      <SubmitBar busy={busy} disabled={!!locked || parcelasInvalid} label={initial ? "Salvar alterações" : parcelando ? "Lançar compra parcelada" : isExp && status === "a_pagar" ? "Registrar conta" : "Lançar"}>
        {initial && <DeleteButton url={`${base}/${initial.id}`} redirect={list} confirmText="Excluir este lançamento? Fica registrado na auditoria." />}
      </SubmitBar>
    </form>
  );
}
