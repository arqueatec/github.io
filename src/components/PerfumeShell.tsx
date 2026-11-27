"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { Toaster } from "./forms";
import { OfflineStatus } from "./OfflineStatus";
import { cx } from "./ui";

const NAV = [
  { href: "/perfumes", label: "Início", icon: "🏠" },
  { href: "/perfumes/vender", label: "Vender", icon: "🏷️" },
  { href: "/perfumes/produtos", label: "Produtos", icon: "🧴" },
  { href: "/perfumes/caixa", label: "Caixa", icon: "💰" },
  { href: "/perfumes/mais", label: "Mais", icon: "☰" },
];

function isActive(path: string, href: string) {
  return href === "/perfumes" ? path === "/perfumes" : path === href || path.startsWith(href + "/");
}

export function PerfumeShell({ user, children }: { user: { name: string; role: string }; children: ReactNode }) {
  const path = usePathname();
  return (
    <div className="min-h-dvh pb-20 md:pb-6">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2">
          <Link href="/perfumes" className="flex shrink-0 items-center gap-1 font-bold" aria-label="Início">
            <span className="text-xl" aria-hidden>
              🧴
            </span>
            <span>Perfumes</span>
          </Link>
          <div className="flex-1" />
          <OfflineStatus />
          <nav className="ml-2 hidden items-center gap-1 md:flex" aria-label="Principal">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={cx("rounded-lg px-3 py-2 text-sm font-medium", isActive(path, n.href) ? "bg-[var(--surface-2)] text-[var(--primary)]" : "text-[var(--muted)]")}>
                {n.label}
              </Link>
            ))}
          </nav>
          {user.role === "admin" && (
            <Link href="/" className="hidden rounded-lg px-2 py-1 text-xs text-[var(--muted)] hover:underline lg:inline" title="Ir para o módulo do gado">
              🐑 Gado
            </Link>
          )}
          <span className="hidden text-xs text-[var(--muted)] lg:inline" title="Usuário logado">
            {user.name}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-4">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Principal">
        <ul className="grid grid-cols-5">
          {NAV.map((n) => (
            <li key={n.href}>
              <Link href={n.href} className={cx("flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", isActive(path, n.href) ? "text-[var(--primary)]" : "text-[var(--muted)]")}>
                <span className={cx("text-xl", n.href === "/perfumes/vender" && "flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary)] text-base")} aria-hidden>
                  {n.icon}
                </span>
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Toaster />
    </div>
  );
}
