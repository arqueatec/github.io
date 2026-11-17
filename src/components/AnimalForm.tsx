"use client";
import { useState } from "react";
import { Field, FormError, PhotoInput, Segmented, SubmitBar, TagInput, todayLocal, useSubmit } from "./forms";
import { addLocalTag, findTag, useTags } from "@/lib/client/tags";
import { categoryLabel, SPECIES_LABEL } from "@/lib/labels";
import { categoriesForSex, type Species } from "@/domain/species";

type Lot = { id: number; name: string };
export interface AnimalInitial {
  id: number;
  species: Species;
  tag: string;
  sex: "M" | "F";
  breed: string | null;
  birthDate: string | null;
  birthDateEstimated: boolean;
  motherTag: string | null;
  fatherTag: string | null;
  category: string;
  lotId: number | null;
  entryDate: string;
  notes: string | null;
}

const BREEDS: Record<Species, string[]> = {
  ovino: ["Santa Inês", "Dorper", "Morada Nova", "Somalis", "Texel", "White Dorper", "Mestiça", "Dorper × Santa Inês"],
  bovino: ["Nelore", "Angus", "Girolando", "Gir", "Guzerá", "Brahman", "Senepol", "Tabapuã", "Mestiço", "Holandês"],
};

function firstCategory(species: Species, sex: "M" | "F") {
  return categoriesForSex(species, sex)[0];
}

export function AnimalForm({ lots, initial, defaultTag }: { lots: Lot[]; initial?: AnimalInitial; defaultTag?: string }) {
  const tags = useTags();
  const edit = !!initial;
  const [f, setF] = useState({
    species: (initial?.species ?? "ovino") as Species,
    tag: initial?.tag ?? defaultTag ?? "",
    sex: (initial?.sex ?? "F") as "M" | "F",
    breed: initial?.breed ?? "",
    birthMode: (initial?.birthDate ? "data" : edit ? "desconhecida" : "idade") as "data" | "idade" | "desconhecida",
    birthDate: initial?.birthDate ?? "",
    birthDateEstimated: initial?.birthDateEstimated ?? false,
    ageMonths: "",
    motherTag: initial?.motherTag ?? "",
    fatherTag: initial?.fatherTag ?? "",
    category: initial?.category ?? "matriz",
    lotId: initial?.lotId ? String(initial.lotId) : "",
    entryDate: initial?.entryDate ?? todayLocal(),
    changeDate: todayLocal(),
    origin: "inventario",
    notes: initial?.notes ?? "",
  });
  const [photo, setPhoto] = useState<{ mime: "image/jpeg"; base64: string } | null>(null);
  const { submit, busy, error, setError } = useSubmit<{ id: number }>();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const dup = !edit && f.tag && findTag(tags, f.tag);
  const categoryChanged = edit && initial && f.category !== initial.category;
  const lotChanged = edit && initial && (f.lotId || null) !== (initial.lotId ? String(initial.lotId) : null);
  const catOptions = categoriesForSex(f.species, f.sex);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (dup) return setError(`Brinco ${f.tag} já cadastrado`);
        const body: Record<string, unknown> = {
          species: f.species,
          tag: f.tag.trim(),
          sex: f.sex,
          breed: f.breed,
          birthDate: f.birthMode === "data" ? f.birthDate : null,
          birthDateEstimated: f.birthMode === "data" ? f.birthDateEstimated : false,
          motherTag: f.motherTag,
          fatherTag: f.fatherTag,
          category: f.category,
          lotId: f.lotId ? Number(f.lotId) : null,
          entryDate: f.entryDate,
          notes: f.notes,
          photo,
        };
        if (edit) {
          body.changeDate = f.changeDate;
          void submit("PATCH", `/api/animals/${initial!.id}`, body, { success: "Animal atualizado", redirect: `/animais/${initial!.id}` });
        } else {
          body.ageMonths = f.birthMode === "idade" ? f.ageMonths : null;
          body.origin = f.origin;
          void submit("POST", "/api/animals", body, {
            offline: `Cadastro do brinco ${f.tag}`,
            success: `Brinco ${f.tag} cadastrado`,
            onSuccess: (d, queued) => {
              addLocalTag({ id: d?.id, tag: f.tag.trim(), species: f.species, sex: f.sex, category: f.category, status: "ativo" });
              if (!queued && d) window.location.href = `/animais/${d.id}`;
            },
          });
        }
      }}
    >
      <div className="card space-y-4">
        {edit ? (
          <p className="text-sm text-[var(--muted)]">Espécie: <b>{SPECIES_LABEL[f.species]}</b> (não é alterável)</p>
        ) : (
          <Field label="Espécie">
            <Segmented
              value={f.species}
              onChange={(v) =>
                setF((x) => {
                  const sex = x.sex;
                  return { ...x, species: v, category: firstCategory(v, sex), breed: "" };
                })
              }
              options={[{ value: "ovino", label: "🐑 Ovino (ovelha)" }, { value: "bovino", label: "🐄 Bovino (gado)" }]}
            />
          </Field>
        )}
        <Field label="Nº do brinco *" error={dup ? "Brinco já cadastrado" : null}>
          <input className="input text-lg font-semibold" required autoCapitalize="characters" value={f.tag} onChange={(e) => set("tag", e.target.value)} autoFocus={!edit} />
        </Field>
        <Field label="Sexo">
          <Segmented
            value={f.sex}
            onChange={(v) =>
              setF((x) => ({
                ...x,
                sex: v,
                category: categoriesForSex(x.species, v).includes(x.category as never) ? x.category : firstCategory(x.species, v),
              }))
            }
            options={[{ value: "F", label: "Fêmea" }, { value: "M", label: "Macho" }]}
          />
        </Field>
        <Field label="Categoria">
          <select className="select" value={f.category} onChange={(e) => set("category", e.target.value)}>
            {catOptions.map((k) => (
              <option key={k} value={k}>
                {categoryLabel(k, f.sex)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Raça">
          <input className="input" value={f.breed} onChange={(e) => set("breed", e.target.value)} list="breeds" />
          <datalist id="breeds">
            {BREEDS[f.species].map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </Field>
        <Field label="Nascimento">
          <Segmented
            value={f.birthMode}
            onChange={(v) => set("birthMode", v)}
            options={[
              { value: "data", label: "Data" },
              ...(edit ? [] : [{ value: "idade" as const, label: "Idade estimada" }]),
              { value: "desconhecida", label: "Desconhecido" },
            ]}
          />
        </Field>
        {f.birthMode === "data" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data de nascimento">
              <input type="date" className="input" value={f.birthDate} max={todayLocal()} onChange={(e) => set("birthDate", e.target.value)} />
            </Field>
            <label className="flex items-center gap-2 pt-6 text-sm">
              <input type="checkbox" checked={f.birthDateEstimated} onChange={(e) => set("birthDateEstimated", e.target.checked)} /> Data aproximada
            </label>
          </div>
        )}
        {f.birthMode === "idade" && (
          <Field label="Idade estimada (meses)" hint="Pela dentição: ovino 2 dentes ≈ 15 m; bovino avalie pela arcada.">
            <input className="input" inputMode="numeric" value={f.ageMonths} onChange={(e) => set("ageMonths", e.target.value)} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mãe" hint="Brinco do rebanho ou nome/registro de fora (PO)">
            <TagInput value={f.motherTag} onChange={(v) => set("motherTag", v)} filter={(t) => t.sex === "F" && t.species === f.species} placeholder="Brinco ou nome" mustExist={false} />
          </Field>
          <Field label="Pai" hint="Brinco do rebanho ou nome/registro de fora (PO)">
            <TagInput value={f.fatherTag} onChange={(v) => set("fatherTag", v)} filter={(t) => t.sex === "M" && t.species === f.species} placeholder="Brinco ou nome" mustExist={false} />
          </Field>
        </div>
        <Field label="Lote / piquete">
          <select className="select" value={f.lotId} onChange={(e) => set("lotId", e.target.value)}>
            <option value="">Sem lote</option>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        {!edit && (
          <Field label="Origem">
            <select className="select" value={f.origin} onChange={(e) => set("origin", e.target.value)}>
              <option value="inventario">Inventário (já estava no rebanho)</option>
              <option value="compra">Compra</option>
              <option value="nascimento">Nascimento (sem parto registrado)</option>
            </select>
          </Field>
        )}
        <Field label="Data de entrada no sistema" hint="Para animais do inventário, a data em que foram anotados.">
          <input type="date" className="input" value={f.entryDate} max={todayLocal()} onChange={(e) => set("entryDate", e.target.value)} />
        </Field>
        {(categoryChanged || lotChanged) && (
          <Field label="Data da mudança de categoria/lote" hint="Fica registrada no histórico e na evolução do efetivo.">
            <input type="date" className="input" value={f.changeDate} max={todayLocal()} onChange={(e) => set("changeDate", e.target.value)} />
          </Field>
        )}
        <Field label="Observações">
          <textarea className="textarea" value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
        <PhotoInput value={photo} onChange={setPhoto} />
      </div>
      <FormError error={error} />
      <SubmitBar busy={busy} label={edit ? "Salvar alterações" : "Cadastrar"} />
    </form>
  );
}
