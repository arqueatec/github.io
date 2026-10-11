"use client";
import { useState } from "react";
import { Field, FormError, Segmented, todayLocal, useSubmit } from "@/components/forms";
import { Badge } from "@/components/ui";

type User = { id: number; name: string; email: string; role: "admin" | "socio"; party: "A" | "B"; active: boolean };

export function UserRow({ user, isMe }: { user: User; isMe: boolean }) {
  const { submit, busy } = useSubmit();
  const patch = (body: Record<string, unknown>, msg: string) => void submit("PATCH", `/api/admin/users/${user.id}`, body, { success: msg });
  return (
    <tr className={user.active ? "" : "opacity-60"}>
      <td>
        {user.name} {isMe && <Badge tone="info">você</Badge>}
      </td>
      <td className="text-xs">{user.email}</td>
      <td>
        <select className="select min-h-9 py-0" value={user.party} disabled={busy} onChange={(e) => confirm("Alterar a parte vale para os próximos lançamentos (os anteriores mantêm a parte registrada). Confirmar?") && patch({ party: e.target.value }, "Parte alterada")}>
          <option value="A">A</option>
          <option value="B">B</option>
        </select>
      </td>
      <td>
        <select className="select min-h-9 py-0" value={user.role} disabled={busy} onChange={(e) => patch({ role: e.target.value }, "Perfil alterado")}>
          <option value="socio">Sócio</option>
          <option value="admin">Admin</option>
        </select>
      </td>
      <td>
        <input type="checkbox" className="h-5 w-5" checked={user.active} disabled={busy || isMe} onChange={(e) => patch({ active: e.target.checked }, e.target.checked ? "Usuário ativado" : "Usuário desativado")} />
      </td>
      <td>
        <button
          className="btn btn-secondary btn-sm"
          disabled={busy}
          onClick={() => {
            const pw = prompt(`Nova senha para ${user.name} (mín. 8 caracteres):`);
            if (pw) patch({ password: pw }, "Senha redefinida");
          }}
        >
          Senha
        </button>
      </td>
    </tr>
  );
}

export function NewUserForm() {
  const [f, setF] = useState({ name: "", email: "", password: "", role: "socio", party: "B" as "A" | "B" });
  const { submit, busy, error } = useSubmit();
  return (
    <form
      className="mt-3 grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit("POST", "/api/admin/users", f, { success: "Usuário criado", onSuccess: () => setF({ ...f, name: "", email: "", password: "" }) });
      }}
    >
      <Field label="Nome">
        <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
      </Field>
      <Field label="E-mail">
        <input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
      </Field>
      <Field label="Senha inicial">
        <input className="input" type="text" minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
      </Field>
      <Field label="Parte">
        <Segmented value={f.party} onChange={(party) => setF({ ...f, party })} options={[{ value: "A", label: "Parte A" }, { value: "B", label: "Parte B" }]} />
      </Field>
      <Field label="Perfil">
        <select className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          <option value="socio">Sócio</option>
          <option value="admin">Administrador</option>
        </select>
      </Field>
      <div className="sm:col-span-2">
        <FormError error={error} />
        <button className="btn btn-primary mt-2 w-full" disabled={busy}>
          Criar usuário
        </button>
      </div>
    </form>
  );
}

export function NewShareForm() {
  const [validFrom, setValidFrom] = useState(todayLocal());
  const [mode, setMode] = useState<"fracao" | "percentual">("fracao");
  const [num, setNum] = useState("1");
  const [den, setDen] = useState("3");
  const [percentA, setPercentA] = useState("");
  const [notes, setNotes] = useState("");
  const { submit, busy, error } = useSubmit();
  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit("POST", "/api/admin/shares", { validFrom, mode, num, den, percentA: percentA.replace(",", "."), notes }, { success: "Nova vigência criada" });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vigente a partir de">
          <input type="date" className="input" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </Field>
        <Field label="Informar como">
          <Segmented value={mode} onChange={setMode} options={[{ value: "fracao", label: "Fração" }, { value: "percentual", label: "%" }]} />
        </Field>
      </div>
      {mode === "fracao" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Parte A — numerador">
            <input className="input" inputMode="numeric" value={num} onChange={(e) => setNum(e.target.value)} />
          </Field>
          <Field label="Denominador" hint={`Parte B = ${Number(den) - Number(num)}/${den}`}>
            <input className="input" inputMode="numeric" value={den} onChange={(e) => setDen(e.target.value)} />
          </Field>
        </div>
      ) : (
        <Field label="Percentual da Parte A" hint={percentA ? `Parte B = ${(100 - Number(percentA.replace(",", "."))).toLocaleString("pt-BR")}%` : "Fração é mais exata para terços"}>
          <input className="input" inputMode="decimal" value={percentA} onChange={(e) => setPercentA(e.target.value)} />
        </Field>
      )}
      <Field label="Observação">
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <FormError error={error} />
      <button className="btn btn-primary w-full" disabled={busy}>
        Salvar vigência
      </button>
    </form>
  );
}

export function CategoryRow({ cat }: { cat: { id: number; kind: "despesa" | "receita"; name: string; active: boolean; sortOrder: number } }) {
  const { submit, busy } = useSubmit();
  return (
    <li className="chip-row">
      <span className={cat.active ? "" : "line-through opacity-60"}>{cat.name}</span>
      <button
        className="ml-auto text-xs text-[var(--primary)]"
        disabled={busy}
        onClick={() => {
          const name = prompt("Novo nome:", cat.name);
          if (name) void submit("PATCH", `/api/admin/categories/${cat.id}`, { ...cat, name }, { success: "Categoria renomeada" });
        }}
      >
        renomear
      </button>
      <button className="text-xs text-[var(--muted)]" disabled={busy} onClick={() => void submit("PATCH", `/api/admin/categories/${cat.id}`, { ...cat, active: !cat.active }, { success: "Categoria atualizada" })}>
        {cat.active ? "desativar" : "ativar"}
      </button>
    </li>
  );
}

export function NewCategoryForm({ kind }: { kind: "despesa" | "receita" }) {
  const [name, setName] = useState("");
  const { submit, busy, error } = useSubmit();
  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit("POST", "/api/admin/categories", { kind, name }, { success: "Categoria criada", onSuccess: () => setName("") });
      }}
    >
      <input className="input min-h-10" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova categoria" required />
      <button className="btn btn-secondary" disabled={busy}>
        +
      </button>
      {error && <span className="field-error">{error}</span>}
    </form>
  );
}

export function LotRow({ lot }: { lot: { id: number; name: string; description: string | null; active: boolean; animals: number } }) {
  const { submit, busy } = useSubmit();
  return (
    <li className="chip-row">
      <span className={lot.active ? "font-medium" : "line-through opacity-60"}>{lot.name}</span>
      <span className="text-xs text-[var(--muted)]">{lot.animals} ativo(s)</span>
      <button
        className="ml-auto text-xs text-[var(--primary)]"
        disabled={busy}
        onClick={() => {
          const name = prompt("Novo nome:", lot.name);
          if (name) void submit("PATCH", `/api/lots/${lot.id}`, { name, description: lot.description, active: lot.active }, { success: "Lote renomeado" });
        }}
      >
        renomear
      </button>
      <button className="text-xs text-[var(--muted)]" disabled={busy} onClick={() => void submit("PATCH", `/api/lots/${lot.id}`, { name: lot.name, description: lot.description, active: !lot.active }, { success: "Lote atualizado" })}>
        {lot.active ? "desativar" : "ativar"}
      </button>
    </li>
  );
}

export function NewLotForm() {
  const [name, setName] = useState("");
  const { submit, busy, error } = useSubmit();
  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit("POST", "/api/lots", { name }, { success: "Lote criado", onSuccess: () => setName("") });
      }}
    >
      <input className="input min-h-10" value={name} onChange={(e) => setName(e.target.value)} placeholder="Novo lote/piquete" required />
      <button className="btn btn-secondary" disabled={busy}>
        +
      </button>
      {error && <span className="field-error">{error}</span>}
    </form>
  );
}

export function SettingsForm({ target }: { target: number }) {
  const [t, setT] = useState(String(target));
  const { submit, busy, error } = useSubmit();
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit("PATCH", "/api/admin/settings", { inventoryTarget: t }, { success: "Configuração salva" });
      }}
    >
      <Field label="Efetivo estimado (meta do inventário)" className="flex-1">
        <input className="input" inputMode="numeric" value={t} onChange={(e) => setT(e.target.value)} />
      </Field>
      <button className="btn btn-primary" disabled={busy}>
        Salvar
      </button>
      <FormError error={error} />
    </form>
  );
}
