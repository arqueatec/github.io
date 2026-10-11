"use client";
import { useState } from "react";
import { Field, FormError, useSubmit } from "@/components/forms";

export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const { submit, busy, error } = useSubmit();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit("POST", "/api/me/password", { current, next }, { success: "Senha alterada", onSuccess: () => (setCurrent(""), setNext("")) });
      }}
    >
      <Field label="Senha atual">
        <input type="password" className="input" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </Field>
      <Field label="Nova senha (mín. 8)">
        <input type="password" className="input" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
      </Field>
      <FormError error={error} />
      <button className="btn btn-primary w-full" disabled={busy}>
        Salvar
      </button>
    </form>
  );
}
