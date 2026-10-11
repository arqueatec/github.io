"use client";
import { enqueue } from "./offlineQueue";

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export type SendResult<T> = { queued: false; data: T } | { queued: true; data: null };

/**
 * Envia JSON para a API. Com `offline`, se não houver rede o lançamento vai para a fila
 * local e é reenviado automaticamente depois (o `clientRef` garante idempotência).
 */
export async function apiSend<T = unknown>(
  method: "POST" | "PATCH" | "DELETE",
  url: string,
  body?: Record<string, unknown>,
  opts: { offline?: string } = {},
): Promise<SendResult<T>> {
  const payload = body && opts.offline && !body.clientRef ? { ...body, clientRef: crypto.randomUUID() } : body;
  if (opts.offline && typeof navigator !== "undefined" && !navigator.onLine) {
    await enqueue({ url, method, body: payload, label: opts.offline });
    return { queued: true, data: null };
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: payload ? { "content-type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
      credentials: "same-origin",
    });
  } catch {
    if (opts.offline) {
      await enqueue({ url, method, body: payload, label: opts.offline });
      return { queued: true, data: null };
    }
    throw new ApiError("Sem conexão com o servidor. Tente novamente quando houver sinal.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new ApiError(data.error ?? "Sessão expirada", 401);
  }
  if (!res.ok) {
    if (opts.offline && res.status >= 500) {
      await enqueue({ url, method, body: payload, label: opts.offline });
      return { queued: true, data: null };
    }
    throw new ApiError(data.error ?? `Erro ${res.status}`, res.status, data.details);
  }
  return { queued: false, data: data as T };
}
