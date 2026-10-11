"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "./forms";
import { OfflineStatus } from "./OfflineStatus";
import { findTag, refreshTags, useTags } from "@/lib/client/tags";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Início", icon: "🏠" },
  { href: "/animais", label: "Rebanho", icon: "🐑" },
  { href: "/lancar", label: "Lançar", icon: "➕" },
  { href: "/financeiro", label: "Finanças", icon: "💰" },
  { href: "/mais", label: "Mais", icon: "☰" },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function AppShell({ user, children }: { user: { name: string; role: string; party: string }; children: ReactNode }) {
  const path = usePathname();
  return (
    <div className="min-h-dvh pb-20 md:pb-6">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2">
          <Link href="/" className="flex shrink-0 items-center gap-1 font-bold" aria-label="Início">
            <span className="text-xl" aria-hidden>
              🐑
            </span>
            <span className="hidden sm:inline">Rebanho</span>
          </Link>
          <TagSearch />
          <OfflineStatus />
          <nav className="ml-2 hidden items-center gap-1 md:flex" aria-label="Principal">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={cx("rounded-lg px-3 py-2 text-sm font-medium", isActive(path, n.href) ? "bg-[var(--surface-2)] text-[var(--primary)]" : "text-[var(--muted)]")}>
                {n.label}
              </Link>
            ))}
          </nav>
          <span className="hidden text-xs text-[var(--muted)] lg:inline" title="Usuário logado">
            {user.name} · Parte {user.party}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-4">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Principal">
        <ul className="grid grid-cols-5">
          {NAV.map((n) => (
            <li key={n.href}>
              <Link href={n.href} className={cx("flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", isActive(path, n.href) ? "text-[var(--primary)]" : "text-[var(--muted)]")}>
                <span className={cx("text-xl", n.href === "/lancar" && "flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary)] text-base")} aria-hidden>
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

/** Busca rápida pelo número do brinco, disponível em todas as telas. */
function TagSearch() {
  const router = useRouter();
  const tags = useTags();
  const [q, setQ] = useState("");
  useEffect(() => {
    void refreshTags();
  }, []);
  return (
    <form
      role="search"
      className="min-w-0 flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        const v = q.trim();
        if (!v) return;
        const hit = findTag(tags, v);
        router.push(hit && hit.id > 0 ? `/animais/${hit.id}` : `/animais?q=${encodeURIComponent(v)}&status=todos`);
        setQ("");
      }}
    >
      <input
        type="search"
        inputMode="text"
        autoCapitalize="characters"
        list="global-tags"
        className="input min-h-10 py-1 text-sm"
        placeholder="🔎 Buscar brinco…"
        aria-label="Buscar animal pelo número do brinco"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <datalist id="global-tags">
        {tags.slice(0, 500).map((t) => (
          <option key={t.id} value={t.tag} />
        ))}
      </datalist>
    </form>
  );
}
