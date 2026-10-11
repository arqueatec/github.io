import Link from "next/link";
import { getDb } from "@/db";
import { pageUser, sp } from "@/server/page";
import { computeBalance, financeSummary, getShares, listExpenses } from "@/server/services/finance";
import { getLockedUntil } from "@/server/services/locks";
import { describeBalance, shareAt, shareLabel } from "@/domain/ledger";
import { formatDateBR, todayIso } from "@/domain/dates";
import { formatCents } from "@/domain/money";
import { Card, LinkButton, PageHeader, Stat, Table } from "@/components/ui";
import { PeriodFilter } from "@/components/PeriodFilter";

export const metadata = { title: "Finanças" };

export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await pageUser();
  const p = await searchParams;
  const today = todayIso();
  const f = { start: sp(p, "start") ?? `${today.slice(0, 4)}-01-01`, end: sp(p, "end") ?? today };
  const db = getDb();
  const [balance, t, shares, lockedUntil, exp] = await Promise.all([computeBalance(db), financeSummary(db, f), getShares(db), getLockedUntil(db), listExpenses(db, f)]);
  const d = describeBalance(balance);
  const s = shareLabel(shareAt(shares, today));
  const byCat = new Map<string, number>();
  for (const e of exp) byCat.set(e.categoryName, (byCat.get(e.categoryName) ?? 0) + e.amountCents);
  const expTotal = t.paid.A + t.paid.B;
  const revTotal = t.received.A + t.received.B;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Finanças"
        subtitle={`Participação vigente: Parte A ${s.A} · Parte B ${s.B}`}
        actions={
          <>
            <LinkButton href="/financeiro/despesas/nova">+ Despesa</LinkButton>
            <LinkButton href="/financeiro/receitas/nova" variant="secondary">+ Receita</LinkButton>
          </>
        }
      />
      <Link href="/financeiro/extrato" className="card block">
        <div className="text-xs uppercase text-[var(--muted)]">Saldo atual entre as partes</div>
        <div className={`mt-1 text-2xl font-bold ${d.debtor === user.party ? "text-[var(--bad)]" : d.debtor ? "text-[var(--good)]" : ""}`}>
          {d.debtor ? `Parte ${d.debtor} deve ${formatCents(d.amountCents)} à Parte ${d.creditor}` : "Contas acertadas"}
        </div>
        <div className="mt-1 text-xs text-[var(--muted)]">
          Despesas e receitas de cada lado já se compensam automaticamente. Ver extrato lançamento a lançamento →
          {lockedUntil && ` · fechado até ${formatDateBR(lockedUntil)}`}
        </div>
      </Link>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Link href="/financeiro/despesas" className="tile">🧾 Despesas</Link>
        <Link href="/financeiro/receitas" className="tile">💵 Receitas</Link>
        <Link href="/financeiro/reembolsos" className="tile">🔁 Reembolsos</Link>
        <Link href="/financeiro/fechamentos" className="tile">🔒 Fechamentos</Link>
      </div>
      <PeriodFilter start={f.start} end={f.end} showParty={false} />
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Despesas" value={formatCents(expTotal)} />
        <Stat label="Receitas" value={formatCents(revTotal)} />
        <Stat label="Resultado" value={formatCents(revTotal - expTotal)} tone={revTotal - expTotal >= 0 ? "good" : "bad"} />
      </div>
      <Card title="Por parte no período">
        <Table head={["", "Parte A", "Parte B"]}>
          <tr>
            <td>Pagou de despesas</td>
            <td className="num">{formatCents(t.paid.A)}</td>
            <td className="num">{formatCents(t.paid.B)}</td>
          </tr>
          <tr>
            <td>Recebeu de receitas</td>
            <td className="num">{formatCents(t.received.A)}</td>
            <td className="num">{formatCents(t.received.B)}</td>
          </tr>
          <tr>
            <td>Fração das despesas (custo)</td>
            <td className="num">{formatCents(t.expenseShare.A)}</td>
            <td className="num">{formatCents(t.expenseShare.B)}</td>
          </tr>
          <tr>
            <td>Fração das receitas (direito)</td>
            <td className="num">{formatCents(t.revenueShare.A)}</td>
            <td className="num">{formatCents(t.revenueShare.B)}</td>
          </tr>
          <tr>
            <td>Reembolsos pagos à outra parte</td>
            <td className="num">{formatCents(t.reimbursed.A)}</td>
            <td className="num">{formatCents(t.reimbursed.B)}</td>
          </tr>
          <tr className="font-semibold">
            <td>Resultado (receitas − despesas)</td>
            <td className={`num ${t.result.A >= 0 ? "text-[var(--good)]" : "text-[var(--bad)]"}`}>{formatCents(t.result.A)}</td>
            <td className={`num ${t.result.B >= 0 ? "text-[var(--good)]" : "text-[var(--bad)]"}`}>{formatCents(t.result.B)}</td>
          </tr>
        </Table>
        <p className="mt-2 text-xs text-[var(--muted)]">Os pagamentos da Parte B registram qual irmão pagou, mas não há acerto interno entre eles.</p>
      </Card>
      <Card title="Despesas por categoria">
        <ul className="space-y-2">
          {[...byCat.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([name, cents]) => (
              <li key={name} className="text-sm">
                <div className="flex justify-between">
                  <span>{name}</span>
                  <span className="tabular-nums">
                    {formatCents(cents)} <span className="text-xs text-[var(--muted)]">({expTotal ? Math.round((cents / expTotal) * 100) : 0}%)</span>
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-[var(--surface-2)]">
                  <div className="h-2 rounded-full bg-[var(--primary)]" style={{ width: `${expTotal ? (cents / expTotal) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
        </ul>
      </Card>
    </div>
  );
}
