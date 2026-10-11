"use client";
/**
 * Fila de lançamentos offline (IndexedDB). Cada item guarda método, URL e corpo JSON
 * (com `clientRef`), e é reenviado quando a conexão volta. O servidor é idempotente
 * por `clientRef`, então reenvios não duplicam registros.
 */

export interface QueuedItem {
  id: string;
  url: string;
  method: string;
  body: unknown;
  label: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
  /** Erro definitivo (4xx): não reenviar automaticamente; o usuário decide. */
  failed?: boolean;
}

const DB_NAME = "ovinos-offline";
const STORE = "queue";
const EVENT = "ovinos-queue-changed";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function notify() {
  window.dispatchEvent(new Event(EVENT));
}

export function onQueueChange(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export async function enqueue(item: Omit<QueuedItem, "id" | "createdAt" | "attempts">) {
  const full: QueuedItem = { ...item, id: crypto.randomUUID(), createdAt: Date.now(), attempts: 0 };
  await tx("readwrite", (s) => s.put(full));
  notify();
  return full;
}

export async function listQueue(): Promise<QueuedItem[]> {
  try {
    const all = await tx<QueuedItem[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedItem[]>);
    return all.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export async function removeItem(id: string) {
  await tx("readwrite", (s) => s.delete(id));
  notify();
}

async function put(item: QueuedItem) {
  await tx("readwrite", (s) => s.put(item));
}

let flushing = false;

/** Reenvia os itens pendentes em ordem. Retorna quantos foram enviados com sucesso. */
export async function flushQueue(): Promise<{ sent: number; failed: number }> {
  if (flushing || !navigator.onLine) return { sent: 0, failed: 0 };
  flushing = true;
  let sent = 0;
  let failed = 0;
  try {
    for (const item of await listQueue()) {
      if (item.failed) {
        failed++;
        continue;
      }
      try {
        const res = await fetch(item.url, {
          method: item.method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(item.body),
          credentials: "same-origin",
        });
        if (res.ok) {
          await removeItem(item.id);
          sent++;
        } else if (res.status === 401) {
          // sessão expirou: mantém na fila até novo login
          item.lastError = "Sessão expirada — entre novamente para enviar";
          await put(item);
          break;
        } else if (res.status >= 400 && res.status < 500) {
          const data = await res.json().catch(() => ({}));
          item.failed = true;
          item.attempts++;
          item.lastError = data.error ?? `Erro ${res.status}`;
          await put(item);
          failed++;
        } else {
          item.attempts++;
          item.lastError = `Servidor indisponível (${res.status})`;
          await put(item);
          break;
        }
      } catch {
        break; // ainda sem rede
      }
    }
  } finally {
    flushing = false;
    notify();
  }
  return { sent, failed };
}

export async function retryItem(id: string) {
  const all = await listQueue();
  const it = all.find((i) => i.id === id);
  if (!it) return;
  it.failed = false;
  await put(it);
  await flushQueue();
}
