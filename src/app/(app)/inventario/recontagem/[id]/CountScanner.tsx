"use client";
import { useRef, useState } from "react";
import { Field, FormError, useSubmit, toast } from "@/components/forms";
import { apiSend, ApiError } from "@/lib/client/api";
import { useRouter } from "next/navigation";

export function CountScanner({ countId }: { countId: number }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [tag, setTag] = useState("");
  const [resolution, setResolution] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const fin = useSubmit();
  return (
    <div className="card space-y-3">
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const t = tag.trim();
          if (!t) return;
          setTag("");
          ref.current?.focus();
          try {
            const r = await apiSend<{ added: boolean }>("POST", `/api/counts/${countId}/tags`, { tag: t }, { offline: `Recontagem: ${t}` });
            setRecent((x) => [t, ...x].slice(0, 30));
            if (!r.queued && r.data && !r.data.added) toast(`${t} já tinha sido contado`, "info");
            router.refresh();
          } catch (err) {
            toast(err instanceof ApiError ? err.message : "Erro", "err");
          }
        }}
      >
        <input ref={ref} className="input min-h-14 text-2xl font-bold" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Brinco" autoFocus autoCapitalize="characters" autoComplete="off" />
        <button className="btn btn-primary min-w-20">Contar</button>
      </form>
      {recent.length > 0 && <p className="text-xs text-[var(--muted)]">Últimos: {recent.join(", ")}</p>}
      <details>
        <summary className="cursor-pointer text-sm font-medium text-[var(--primary)]">Concluir recontagem</summary>
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (confirm("Concluir a recontagem? As divergências ficarão registradas."))
              void fin.submit("POST", `/api/counts/${countId}/finish`, { resolution }, { success: "Recontagem concluída" });
          }}
        >
          <Field label="Resolução / observações das divergências">
            <textarea className="textarea" value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Ex.: M012 estava no piquete 2; brinco 77 perdido, recolocado como 77A…" />
          </Field>
          <FormError error={fin.error} />
          <button className="btn btn-primary w-full" disabled={fin.busy}>
            Concluir
          </button>
        </form>
      </details>
    </div>
  );
}
