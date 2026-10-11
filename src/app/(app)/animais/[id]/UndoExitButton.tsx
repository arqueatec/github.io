"use client";
import { useSubmit } from "@/components/forms";

export function UndoExitButton({ exitId }: { exitId: number }) {
  const { submit, busy } = useSubmit();
  return (
    <button
      className="btn btn-secondary btn-sm"
      disabled={busy}
      onClick={() => {
        if (confirm("Desfazer esta baixa? O animal volta a ficar ativo. Se houver receita de venda vinculada (só deste animal), ela também será excluída."))
          void submit("DELETE", `/api/exits/${exitId}`, undefined, { success: "Baixa desfeita" });
      }}
    >
      Desfazer baixa
    </button>
  );
}
