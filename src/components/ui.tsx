import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: ReactNode; actions?: ReactNode; back?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <Link href={back} className="mb-1 inline-block text-sm text-[var(--muted)] hover:underline">
            ← Voltar
          </Link>
        )}
        <h1 className="text-xl font-bold leading-tight sm:text-2xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-[var(--muted)]">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className, actions }: { title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cx("card", className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function LinkButton({ href, children, variant = "primary", className, ...rest }: ComponentProps<typeof Link> & { variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <Link href={href} className={cx("btn", `btn-${variant}`, className)} {...rest}>
      {children}
    </Link>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "info" }) {
  return <span className={cx("badge", `badge-${tone}`)}>{children}</span>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="stat">
      <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className={cx("mt-1 text-xl font-bold tabular-nums", tone === "good" && "text-[var(--good)]", tone === "bad" && "text-[var(--bad)]")}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-[var(--muted)]">{hint}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-[var(--border)] p-4 text-center text-sm text-[var(--muted)]">{children}</p>;
}

export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={cx("table-wrap", className)}>
      <table className="tbl">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Formula({ formula, notes }: { formula: string; notes?: string[] }) {
  return (
    <details className="formula">
      <summary>Fórmula</summary>
      <p className="font-mono text-xs">{formula}</p>
      {notes?.map((n, i) => (
        <p key={i} className="mt-1 text-xs text-[var(--muted)]">
          {n}
        </p>
      ))}
    </details>
  );
}
