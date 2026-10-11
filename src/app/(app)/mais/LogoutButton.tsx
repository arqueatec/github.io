"use client";
import { clearOfflineCaches } from "@/components/ServiceWorker";

export function LogoutButton() {
  return (
    <button
      className="btn btn-secondary w-full"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        await clearOfflineCaches();
        window.location.href = "/login";
      }}
    >
      Sair
    </button>
  );
}
