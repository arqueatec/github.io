"use client";
import { useState } from "react";
import { Field, FormError, Segmented, SubmitBar, TagListInput, todayLocal, useSubmit } from "@/components/forms";
import { useTags } from "@/lib/client/tags";
import { HEALTH_LABEL } from "@/lib/labels";
import { addDays } from "@/domain/dates";

type HType = "vacina" | "vermifugacao" | "tratamento" | "outro";

export function HealthForm({ lots, initialTags, initialProduct, initialType }: { lots: { id: number; name: string; animals: number }[]; initialTags: string[]; initialProduct: string; initialType: HType }) {
  const tags = useTags();
  const [type, setType] = useState<HType>(initialType);
  const [date, setDate] = useState(todayLocal());
  const [product, setProduct] = useState(initialProduct);
  const [dose, setDose] = useState("");
  const [withdrawalDays, setWithdrawalDays] = useState("");
  const [nextDoseDate, setNextDoseDate] = useState("");
  const [notes, setNotes] = useState("");
  const [target, setTarget] = useState<"animais" | "lote">(initialTags.length ? "animais" : "animais");
  const [lotId, setLotId] = useState("");
  const [selected, setSelected] = useState<string[]>(initialTags);
  const [famacha, setFamacha] = useState<Record<string, string>>({});
  const { submit, busy, error } = useSubmit<{ count: number }>();
  const activeAll = tags.filter((t) => t.status === "ativo");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const body = {
          type,
          date,
          product,
          dose,
          withdrawalDays,
          nextDoseDate,
          notes,
          lotId: target === "lote" && lotId ? Number(lotId) : null,
          items: target === "animais" ? selected.map((t) => ({ tag: t, famacha: famacha[t] || null })) : [],
        };
        void submit("POST", "/api/health", body, {
          offline: `${HEALTH_LABEL[type]} ${product}`,
          success: "Aplicação registrada",
          onSuccess: () => {
            setSelected([]);
            setFamacha({});
          },
        });
      }}
    >
      <div className="card space-y-4">
        <Field label="Tipo">
          <Segmented value={type} onChange={setType} options={Object.entries(HEALTH_LABEL).map(([value, label]) => ({ value: value as HType, label }))} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data">
            <input type="date" className="input" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Dose">
            <input className="input" value={dose} onChange={(e) => setDose(e.target.value)} placeholder="Ex.: 1 ml/10 kg" />
          </Field>
        </div>
        <Field label="Medicamento / produto">
          <input className="input" value={product} onChange={(e) => setProduct(e.target.value)} list="products" required />
          <datalist id="products">
            {["Closantel 10%", "Monepantel", "Levamisol", "Moxidectina", "Ivermectina", "Albendazol", "Polivalente clostridioses", "Raiva", "Oxitetraciclina LA", "Penicilina", "Anti-inflamatório"].map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Carência (dias)" hint="Bloqueia venda/abate">
            <input className="input" inputMode="numeric" value={withdrawalDays} onChange={(e) => setWithdrawalDays(e.target.value)} />
          </Field>
          <Field label="Próxima dose" hint="Gera alerta">
            <input type="date" className="input" value={nextDoseDate} onChange={(e) => setNextDoseDate(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-1">
          {[21, 30, 90, 180, 365].map((d) => (
            <button key={d} type="button" className="btn btn-secondary btn-sm" onClick={() => setNextDoseDate(addDays(date, d))}>
              +{d} d
            </button>
          ))}
        </div>
      </div>
      <div className="card space-y-3">
        <Field label="Aplicar em">
          <Segmented value={target} onChange={setTarget} options={[{ value: "animais", label: "Animais (brincos)" }, { value: "lote", label: "Lote inteiro" }]} />
        </Field>
        {target === "lote" ? (
          <select className="select" value={lotId} onChange={(e) => setLotId(e.target.value)} required>
            <option value="">Escolha o lote</option>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.animals} ativos)
              </option>
            ))}
          </select>
        ) : (
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelected(activeAll.map((t) => t.tag))}>
              + Todo o rebanho ativo ({activeAll.length})
            </button>
            <TagListInput
              values={selected}
              onChange={setSelected}
              filter={(t) => t.status === "ativo"}
              extra={
                type === "vermifugacao"
                  ? (tag) => (
                      <select
                        aria-label={`FAMACHA de ${tag}`}
                        className="select min-h-9 w-24 py-0 text-sm"
                        value={famacha[tag] ?? ""}
                        onChange={(e) => setFamacha({ ...famacha, [tag]: e.target.value })}
                      >
                        <option value="">FAMACHA</option>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    )
                  : undefined
              }
            />
            {type === "vermifugacao" && <p className="field-hint">FAMACHA opcional por animal (1 = vermelho/saudável … 5 = branco/anemia grave).</p>}
          </>
        )}
        <Field label="Observações">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <FormError error={error} />
      <SubmitBar busy={busy} label="Registrar aplicação" />
    </form>
  );
}
