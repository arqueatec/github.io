import Link from "next/link";
import { getDb } from "@/db";
import { pageUser, sp, spInt } from "@/server/page";
import { dashboard, defaultPeriod } from "@/server/services/dashboard";
import { listLots } from "@/server/services/admin";
import { isIsoDate, formatDateBR } from "@/domain/dates";
import type { Indicator } from "@/domain/indices";
import { formatCents } from "@/domain/money";
import { Badge, Card, Empty, Formula, LinkButton, PageHeader, Stat, Table } from "@/components/ui";
import { PeriodFilter, exportQuery } from "@/components/PeriodFilter";
import { HBarList, HerdChart } from "@/components/Charts";
import { CATEGORY_LABEL } from "@/lib/labels";

export const metadata = { title: "Indicadores" };

function fmt(i: Indicator) {
  if (i.value === null) return "—";
  const digits = i.unit === "%" || i.unit === "dias" ? 1 : 2;
  const v = i.value.toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: i.unit === "dias" ? 0 : undefined });
  return i.unit === "%" ? `${v}%` : `${v} ${i.unit}`;
}

function IndicatorCard({ i }: { i: Indicator }) {
  return (
    <div className="stat">
      <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{i.label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{fmt(i)}</div>
      <div className="text-xs text-[var(--muted)]">
        {i.numerator.toLocaleString("pt-BR")} ÷ {i.denominator.toLocaleString("pt-BR")}
      </div>
      <Formula formula={i.formula} notes={i.notes} />
    </div>
  );
}

export default async function IndicadoresPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await pageUser();
  const p = await searchParams;
  const def = defaultPeriod();
  const start = sp(p, "start");
  const end = sp(p, "end");
  const f = {
    start: start && isIsoDate(start) ? start : def.start,
    end: end && isIsoDate(end) ? end : def.end,
    party: (sp(p, "party") as "A" | "B" | null) ?? null,
    lotId: spInt(p, "lotId"),
  };
  if (f.start > f.end) [f.start, f.end] = [f.end, f.start];
  const db = getDb();
  const [d, lots] = await Promise.all([dashboard(db, f), listLots(db)]);
  const c = d.ewes.completeness;
  const q = exportQuery(f);
  const partyLabel = f.party ? `Parte ${f.party}` : "ambas as partes";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Indicadores"
        subtitle={`${formatDateBR(f.start)} a ${formatDateBR(f.end)}${f.lotId ? ` · ${lots.find((l) => l.id === f.lotId)?.name}` : ""} · finanças: ${partyLabel}`}
        actions={
          <>
            <LinkButton href={`/api/export/indicadores?format=pdf&${q}`} variant="secondary" prefetch={false}>PDF</LinkButton>
            <LinkButton href={`/api/export/indicadores?format=csv&${q}`} variant="secondary" prefetch={false}>CSV</LinkButton>
          </>
        }
      />
      <PeriodFilter {...f} lots={lots} />

      {(c.ewesActive > c.ewesWithInterval || c.inventoryAnimals > 0) && (
        <div className="rounded-lg border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm text-[var(--warn)]">
          <b>Histórico incompleto.</b> {c.inventoryAnimals} animal(is) vieram do inventário inicial (sem partos anteriores registrados);{" "}
          {c.animalsUnknownBirth} ativo(s) sem data de nascimento; {c.animalsUnknownMother} sem mãe conhecida. O intervalo entre partos só existe para{" "}
          {c.ewesWithInterval} matriz(es) com 2+ partos registrados. Primeiro registro: {formatDateBR(c.firstRecordDate)}.
        </div>
      )}

      <Card title="Efetivo do rebanho">
        <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          <Stat label="Total" value={d.herd.current.total} hint={`início: ${d.herd.atStart.total}`} />
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
            <Stat key={k} label={v} value={d.herd.current[k as keyof typeof d.herd.current]} hint={`início: ${d.herd.atStart[k as keyof typeof d.herd.atStart]}`} />
          ))}
        </div>
        <HerdChart data={d.herd.evolution} />
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-[var(--primary)]">Ver tabela</summary>
          <Table head={["Mês", ...Object.values(CATEGORY_LABEL), "Total"]}>
            {d.herd.evolution.map((p) => (
              <tr key={p.date}>
                <td>{formatDateBR(p.date)}</td>
                {Object.keys(CATEGORY_LABEL).map((k) => (
                  <td key={k} className="num">
                    {p[k as keyof typeof p]}
                  </td>
                ))}
                <td className="num font-semibold">{p.total}</td>
              </tr>
            ))}
          </Table>
        </details>
        <p className="mt-2 text-xs text-[var(--muted)]">Efetivo médio no período: {d.herd.averageHeadcount.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} cabeças (dias-animal ÷ dias).</p>
      </Card>

      <Card title="Reprodução">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          <IndicatorCard i={d.repro.natalidade} />
          <IndicatorCard i={d.repro.paricao} />
          <IndicatorCard i={d.repro.prolificidade} />
          <IndicatorCard i={d.repro.partosMatrizAno} />
          <IndicatorCard i={d.repro.iep} />
          <div className="stat">
            <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Partos/ano pelo IEP</div>
            <div className="mt-1 text-xl font-bold tabular-nums">{d.repro.iep.value ? (365 / d.repro.iep.value).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"}</div>
            <Formula formula="365 ÷ intervalo médio entre partos (dias)" />
          </div>
        </div>
      </Card>

      <Card title="Mortalidade e desmame">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          <IndicatorCard i={d.mortality.general} />
          <IndicatorCard i={d.mortality.lambs} />
          <IndicatorCard i={d.mortality.adult} />
          <IndicatorCard i={d.weaning.taxa} />
          <IndicatorCard i={d.weaning.peso} />
        </div>
        <h3 className="mb-2 mt-4 text-sm font-semibold">Causas de morte no período</h3>
        {d.mortality.causes.length ? <HBarList items={d.mortality.causes.map((x) => ({ name: x.cause, value: x.count }))} /> : <Empty>Nenhuma morte no período.</Empty>}
      </Card>

      <Card title="Ranking de matrizes" actions={<Link className="link text-sm" href={`/api/export/matrizes?format=csv&${q}`} prefetch={false}>CSV</Link>}>
        <p className="mb-2 text-xs text-[var(--muted)]">Ordem: crias desmamadas, depois partos, depois menor intervalo entre partos. Considera todo o histórico registrado até o fim do período.</p>
        {d.ewes.ranking.length ? (
          <Table head={["#", "Matriz", "Partos", "Crias", "Desmam.", "Kg desm.", "IEP médio", "Prolif."]}>
            {d.ewes.ranking.map((s, i) => (
              <tr key={s.eweId}>
                <td className="num">{i + 1}</td>
                <td>
                  <Link className="link font-semibold" href={`/animais/${s.eweId}`}>
                    {s.tag}
                  </Link>
                </td>
                <td className="num">{s.births}</td>
                <td className="num">{s.lambsBorn}</td>
                <td className="num">{s.lambsWeaned}</td>
                <td className="num">{s.weanedKg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>
                <td className="num">{s.avgInterval ? `${Math.round(s.avgInterval)} d` : <span className="text-[var(--muted)]" title="Precisa de 2 partos registrados">—</span>}</td>
                <td className="num">{s.prolificacy?.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) ?? "—"}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Sem matrizes com dados.</Empty>
        )}
      </Card>

      <Card title={`Matrizes improdutivas — candidatas a descarte (${d.ewes.unproductive.length})`}>
        <p className="mb-2 text-xs text-[var(--muted)]">Critérios: sem parto há mais de 365 dias (ou nenhum parto em 365 dias no rebanho), intervalo médio entre partos acima de 365 dias, 2+ diagnósticos vazios desde o último parto, perda de metade ou mais das crias antes do desmame, ou já classificada como descarte.</p>
        {d.ewes.unproductive.length ? (
          <ul className="divide-y divide-[var(--border)]">
            {d.ewes.unproductive.map((u) => (
              <li key={u.eweId} className="py-2 text-sm">
                <Link className="link font-semibold" href={`/animais/${u.eweId}`}>
                  {u.tag}
                </Link>{" "}
                {u.reasons.map((r) => (
                  <Badge key={r} tone="warn">
                    {r}
                  </Badge>
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nenhuma matriz improdutiva pelos critérios.</Empty>
        )}
      </Card>

      <Card title={`Finanças (${partyLabel})`}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label={f.party ? `Pago pela Parte ${f.party}` : "Despesas"} value={formatCents(d.finance.expenseTotal)} />
          <Stat label={f.party ? `Recebido pela Parte ${f.party}` : "Receitas"} value={formatCents(d.finance.revenueTotal)} />
          <Stat label="Resultado do período" value={formatCents(d.finance.totals.revenueShare.A + d.finance.totals.revenueShare.B - d.finance.totals.expenseShare.A - d.finance.totals.expenseShare.B)} hint="receitas − despesas (ambas as partes)" />
          <div className="stat">
            <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Custo por cabeça</div>
            <div className="mt-1 text-xl font-bold tabular-nums">{d.finance.costPerHead.value === null ? "—" : formatCents(Math.round(d.finance.costPerHead.value))}</div>
            <div className="text-xs text-[var(--muted)]">
              {formatCents(d.finance.costPerHead.numerator)} ÷ {d.finance.costPerHead.denominator.toLocaleString("pt-BR")} cab.
            </div>
            <Formula formula={d.finance.costPerHead.formula} notes={f.party ? ["Com filtro de parte, considera só as despesas pagas por ela."] : undefined} />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="stat">
            <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Resultado Parte A</div>
            <div className={`mt-1 text-xl font-bold ${d.finance.totals.result.A >= 0 ? "text-[var(--good)]" : "text-[var(--bad)]"}`}>{formatCents(d.finance.totals.result.A)}</div>
            <Formula formula="Fração A das receitas − fração A das despesas (pela participação vigente em cada data)" />
          </div>
          <div className="stat">
            <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Resultado Parte B</div>
            <div className={`mt-1 text-xl font-bold ${d.finance.totals.result.B >= 0 ? "text-[var(--good)]" : "text-[var(--bad)]"}`}>{formatCents(d.finance.totals.result.B)}</div>
            <Formula formula="Fração B das receitas − fração B das despesas" />
          </div>
        </div>
        <Link href="/financeiro/extrato" className="mt-3 block rounded-lg bg-[var(--surface-2)] p-3 text-sm">
          <span className="text-xs text-[var(--muted)]">Saldo atual entre as partes: </span>
          <b>{d.finance.balanceDesc.debtor ? `Parte ${d.finance.balanceDesc.debtor} deve ${formatCents(d.finance.balanceDesc.amountCents)} à Parte ${d.finance.balanceDesc.creditor}` : "acertado"}</b>
        </Link>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Custo por categoria de despesa</h3>
            {d.finance.expenseByCategory.length ? <HBarList money items={d.finance.expenseByCategory.map((x) => ({ name: x.name, value: x.cents }))} /> : <Empty>Sem despesas.</Empty>}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Receita por categoria</h3>
            {d.finance.revenueByCategory.length ? <HBarList money items={d.finance.revenueByCategory.map((x) => ({ name: x.name, value: x.cents }))} /> : <Empty>Sem receitas.</Empty>}
          </div>
        </div>
      </Card>
    </div>
  );
}
