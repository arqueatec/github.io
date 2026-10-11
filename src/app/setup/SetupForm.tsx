"use client";
import { useState } from "react";
import { Field, FormError, Segmented } from "@/components/forms";

export function SetupForm() {
  const [f, setF] = useState({ name: "", email: "", password: "", party: "A" as "A" | "B" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="card space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch("/api/auth/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Falha");
          setBusy(false);
          return;
        }
        window.location.href = "/admin";
      }}
    >
      <Field label="Nome">
        <input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Field>
      <Field label="E-mail">
        <input className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      </Field>
      <Field label="Senha (mín. 8 caracteres)">
        <input className="input" type="password" minLength={8} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
      </Field>
      <Field label="Sua parte na sociedade">
        <Segmented value={f.party} onChange={(party) => setF({ ...f, party })} options={[{ value: "A", label: "Parte A" }, { value: "B", label: "Parte B" }]} />
      </Field>
      <FormError error={error} />
      <button className="btn btn-primary btn-lg w-full" disabled={busy}>
        Criar administrador
      </button>
    </form>
  );
}
