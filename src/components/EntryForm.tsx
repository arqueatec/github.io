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
  // Pagamento parcial (só na criação de despesa paga): parte paga agora + saldo a pagar.
  const [partial, setPartial] = useState(false);
  const [paidNow, setPaidNow] = useState<number | null>(null);
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
  // Pagamento parcial válido: criação de despesa paga, com valor pago informado e menor que o total.
  const canPartial = isExp && !initial && status === "pago";
  const splitting = canPartial && partial;
  const remaining = splitting && amount != null && paidNow != null ? amount - paidNow : null;
  // valor que de fato afeta o saldo entre as partes (no parcial, só a parcela paga agora)
  const effectAmount = splitting ? paidNow : amount;
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
          body.status = status;
          body.animalTag = animalTag || null;
          body.paidByUserId = payable ? null : Number(userId);
          body.dueDate = payable ? dueDate : splitting ? dueDate : null;
          if (splitting) body.paidNowCents = paidNow;
        } else {
          body.receivedByUserId = Number(userId);
        }
        const noun = isExp ? (payable ? "Conta a pagar" : "Despesa") : "Receita";
        // Após um lançamento que gera conta pendente (a pagar ou parcial), leva à lista de contas.
        const toPayables = payable || splitting;
        if (initial) {
          body.removeReceipt = removeReceipt;
          void submit("PATCH", `${base}/${initial.id}`, body, { success: "Lançamento atualizado", redirect: payable ? "/financeiro/contas-a-pagar" : list });
        } else {
          void submit("POST", base, body, {
            offline: `${noun} ${amount ? formatCents(amount) : ""}`,
            success: splitting ? "Despesa lançada — saldo em Contas a pagar" : `${noun} ${payable ? "registrada" : "lançada"}`,
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
        <Field label={splitting ? "Valor total *" : "Valor *"}>
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
        ) : (
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
        {canPartial && (
          <div className="rounded-lg border border-[var(--border)] p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} />
              Pagamento parcial (paguei só uma parte agora)
            </label>
            {partial && (
              <>
                <Field label="Valor pago agora *" hint="Quanto foi pago neste momento — só isto entra no acerto entre as partes.">
                  <MoneyInput cents={paidNow} onChange={setPaidNow} required />
                </Field>
                <Field label="Vencimento do saldo *" hint="Quando o restante precisa ser pago.">
                  <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
                </Field>
                {amount != null && paidNow != null && (
                  <p className={`rounded-lg p-2 text-sm ${remaining != null && remaining > 0 ? "bg-[var(--warn-bg)] text-[var(--warn)]" : "bg-[var(--bad-bg)] text-[var(--bad)]"}`}>
                    {remaining != null && remaining > 0
                      ? <>Saldo a pagar: <strong>{formatCents(remaining)}</strong> — fica em aberto (sem parte A/B) até ser pago.</>
                      : "O valor pago deve ser menor que o total."}
                  </p>
                )}
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
              {splitting && "Sobre a parcela paga agora — "}Rateio {share.num}/{share.den} – {share.den - share.num}/{share.den}: {preview}.
            </p>
          )
        )}
      </div>
      <FormError error={error} />
      <SubmitBar busy={busy || !!locked} label={initial ? "Salvar alterações" : isExp && status === "a_pagar" ? "Registrar conta" : "Lançar"}>
        {initial && <DeleteButton url={`${base}/${initial.id}`} redirect={list} confirmText="Excluir este lançamento? Fica registrado na auditoria." />}
      </SubmitBar>
    </form>
  );
}
