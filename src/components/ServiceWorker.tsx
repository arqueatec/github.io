"use client";
import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}

/** Limpa caches de páginas (chamado no logout para não deixar dados no aparelho). */
export async function clearOfflineCaches() {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("ovinos-pages")).map((k) => caches.delete(k)));
    localStorage.removeItem("ovinos-tags-v1");
  } catch {}
}
