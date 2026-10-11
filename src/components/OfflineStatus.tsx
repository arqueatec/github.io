"use client";
import { useEffect, useState } from "react";
import { flushQueue, listQueue, onQueueChange, removeItem, retryItem, type QueuedItem } from "@/lib/client/offlineQueue";
import { useRouter } from "next/navigation";
import { toast } from "./forms";

/** Indicador de conexão + fila de lançamentos pendentes. Sincroniza ao voltar o sinal. */
export function OfflineStatus() {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [items, setItems] = useState<QueuedItem[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const load = () => listQueue().then(setItems);
    const sync = async () => {
      const r = await flushQueue();
      if (r.sent) {
        toast(`${r.sent} lançamento(s) offline enviado(s)`);
        router.refresh();
      }
      if (r.failed) toast(`${r.failed} lançamento(s) offline com erro — toque no ícone da fila`, "err");
    };
    setOnline(navigator.onLine);
    load();
    void sync();
    const on = () => {
      setOnline(true);
      void sync();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const unsub = onQueueChange(load);
    const t = setInterval(() => navigator.onLine && void sync(), 30_000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      unsub();
      clearInterval(t);
    };
  }, [router]);

  const pending = items.length;
  if (online && !pending) return null;
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`badge ${online ? "badge-warn" : "badge-bad"} min-h-8`}
        aria-label="Fila de lançamentos offline"
      >
        {online ? "⏳" : "📵 offline"} {pending > 0 && `${pending}`}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-40 w-80 max-w-[90vw] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl">
          <p className="mb-2 text-sm font-semibold">{pending ? `${pending} lançamento(s) aguardando envio` : "Sem pendências"}</p>
          {!online && <p className="mb-2 text-xs text-[var(--muted)]">Sem sinal. Os lançamentos serão enviados automaticamente quando a conexão voltar.</p>}
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {items.map((i) => (
              <li key={i.id} className="rounded-lg border border-[var(--border)] p-2 text-sm">
                <div className="font-medium">{i.label}</div>
                <div className="text-xs text-[var(--muted)]">{new Date(i.createdAt).toLocaleString("pt-BR")}</div>
                {i.lastError && <div className="text-xs text-[var(--bad)]">{i.lastError}</div>}
                <div className="mt-1 flex gap-2">
                  {i.failed && (
                    <button className="btn btn-secondary btn-sm" onClick={() => retryItem(i.id)}>
                      Tentar de novo
                    </button>
                  )}
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      if (confirm("Descartar este lançamento? Ele não será enviado.")) void removeItem(i.id);
                    }}
                  >
                    Descartar
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {online && pending > 0 && (
            <button className="btn btn-primary btn-sm mt-2 w-full" onClick={() => flushQueue().then(() => router.refresh())}>
              Enviar agora
            </button>
          )}
        </div>
      )}
    </div>
  );
}
