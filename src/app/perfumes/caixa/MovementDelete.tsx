"use client";
import { useSubmit } from "@/components/forms";

export function MovementDelete({ id }: { id: number }) {
  const { submit, busy } = useSubmit();
  return (
    <button
      type="button"
      className="text-xs text-[var(--bad)] disabled:opacity-50"
      disabled={busy}
      onClick={() => {
        if (confirm("Estornar este movimento? O estoque é desfeito e fica registrado na auditoria.")) {
          void submit("DELETE", `/api/perfumes/movements/${id}`, undefined, { success: "Movimento estornado" });
        }
      }}
    >
      estornar
    </button>
  );
}
