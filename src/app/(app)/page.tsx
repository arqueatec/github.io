import Link from "next/link";
import { getDb } from "@/db";
import { pageUser } from "@/server/page";
import { getAlerts } from "@/server/services/health";
import { computeBalance } from "@/server/services/finance";
import { inventoryProgress } from "@/server/services/inventory";
import { loadHerd } from "@/server/services/dashboard";
import { herdByCategory } from "@/domain/indices";
import { describeBalance } from "@/domain/ledger";
import { formatCents } from "@/domain/money";
import { diffDays, formatDateBR, todayIso } from "@/domain/dates";
import { Badge, Card, Empty, Stat } from "@/components/ui";
import { CATEGORY_LABEL, HEALTH_LABEL } from "@/lib/labels";

export default async function Home({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const user = await pageUser();
  const { erro } = await searchParams;
  const db = getDb();
  const today = todayIso();
  const [alerts, balance, inv, herd] = await Promise.all([getAlerts(db, today, 45), computeBalance(db), inventoryProgress(db), loadHerd(db)]);
  const b = describeBalance(balance);
  const counts = herdByCategory(herd.animals, today);
  const withdrawalGroups = new Map<string, { until: string; tags: string[] }>();
  for (const w of alerts.withdrawals) {
    const k = `${w.product}|${w.until}`;
    const g = withdrawalGroups.get(k) ?? { until: w.until!, tags: [] };
    if (!g.tags.includes(w.tag)) g.tags.push(w.tag);
    withdrawalGroups.set(k, g);
  }
  const invPct = Math.min(100, Math.round((inv.total / Math.max(1, inv.target)) * 100));

  return (
    <div className="space-y-4">
      {erro === "acesso" && (
        <div className="rounded-lg border border-[var(--bad)] bg-[var(--bad-bg)] p-3 text-sm text-[var(--bad)]" role="alert">
          Essa área é restrita ao administrador.
        </div>
      )}
      <div>
        <h1 className="text-xl font-bold">Olá, {user.name.split(" ")[0]}</h1>
        <p className="text-sm text-[var(--muted)]">{formatDateBR(today)} · Parte {user.party}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link href="/financeiro/extrato" className="col-span-2">
          <Stat
            label="Saldo entre as partes"
            value={b.debtor ? `${formatCents(b.amountCents)}` : "Acertado"}
            hint={b.debtor ? `Parte ${b.debtor} deve à Parte ${b.creditor}` : "Ninguém deve a ninguém"}
            tone={b.debtor ? (b.debtor === user.party ? "bad" : "good") : undefined}
          />
        </Link>
        <Link href="/animais">
          <Stat label="Animais ativos" value={counts.total} hint={`${counts.matriz} matrizes · ${counts.reprodutor} reprod.`} />
        </Link>
        <Link href="/inventario">
          <Stat label="Inventário" value={`${inv.total}/${inv.target}`} hint={`${invPct}% do efetivo estimado`} />
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {[
          ["/inventario", "📝", "Inventário"],
          ["/reproducao/parto", "🍼", "Parto"],
          ["/sanidade/novo", "💉", "Sanidade"],
          ["/financeiro/despesas/nova", "🧾", "Despesa"],
          ["/baixas/nova", "⚰️", "Baixa"],
          ["/indicadores", "📊", "Índices"],
        ].map(([href, icon, label]) => (
          <Link key={href} href={href} className="tile">
            <span className="text-2xl" aria-hidden>
              {icon}
            </span>
            {label}
          </Link>
        ))}
      </div>

      <Card title={`Partos previstos (${alerts.births.length})`} actions={<Link className="link text-sm" href="/reproducao">Reprodução</Link>}>
        {alerts.births.length ? (
          <ul className="divide-y divide-[var(--border)]">
            {alerts.births.slice(0, 12).map((x) => {
              const d = diffDays(today, x.expected);
              return (
                <li key={x.breedingId} className="flex items-center justify-between py-2 text-sm">
                  <Link className="link" href={`/animais/${x.eweId}`}>
                    {x.eweTag}
                  </Link>
                  <span>
                    {formatDateBR(x.expected)} <Badge tone={d < 0 ? "bad" : d <= 7 ? "warn" : "info"}>{d < 0 ? `${-d} d atrasado` : d === 0 ? "hoje" : `em ${d} d`}</Badge>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>Nenhum parto previsto nos próximos 45 dias.</Empty>
        )}
        {alerts.births.length > 12 && <p className="mt-2 text-xs text-[var(--muted)]">+ {alerts.births.length - 12} outros</p>}
      </Card>

      <Card title={`Próximas doses (${alerts.doses.length})`} actions={<Link className="link text-sm" href="/sanidade">Sanidade</Link>}>
        {alerts.doses.length ? (
          <ul className="divide-y divide-[var(--border)]">
            {alerts.doses.map((g) => (
              <li key={`${g.product}-${g.date}`} className="py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {HEALTH_LABEL[g.type]}: {g.product}
                  </span>
                  <Badge tone={g.overdue ? "bad" : "warn"}>{g.overdue ? `vencida ${formatDateBR(g.date)}` : formatDateBR(g.date)}</Badge>
                </div>
                <div className="text-xs text-[var(--muted)]">
                  {g.tags.length} animal(is): {g.tags.slice(0, 15).map((t) => t.tag).join(", ")}
                  {g.tags.length > 15 && "…"}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nenhuma dose prevista para os próximos 45 dias.</Empty>
        )}
      </Card>

      {withdrawalGroups.size > 0 && (
        <Card title="Em período de carência">
          <ul className="space-y-2 text-sm">
            {[...withdrawalGroups.entries()].map(([k, g]) => (
              <li key={k}>
                <span className="font-medium">{k.split("|")[0]}</span> até <Badge tone="warn">{formatDateBR(g.until)}</Badge>
                <div className="text-xs text-[var(--muted)]">
                  {g.tags.length} animal(is): {g.tags.slice(0, 20).join(", ")}
                  {g.tags.length > 20 && "…"} — não vender/abater/consumir antes.
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Efetivo por categoria">
        <div className="grid grid-cols-5 gap-2 text-center">
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
            <Link key={k} href={`/animais?category=${k}`} className="rounded-lg bg-[var(--surface-2)] p-2">
              <div className="text-lg font-bold">{counts[k as keyof typeof counts]}</div>
              <div className="text-[10px] text-[var(--muted)]">{v}</div>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
