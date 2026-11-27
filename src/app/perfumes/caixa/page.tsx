import { getDb } from "@/db";
import { pageUserArea, sp } from "@/server/page";
import { listPerfumeMovements, perfumeCashSummary } from "@/server/services/perfumes";
import { formatCents } from "@/domain/money";
import { formatDateBR, todayIso } from "@/domain/dates";
import { Badge, Card, Empty, PageHeader, Stat, Table } from "@/components/ui";
import { PeriodFilter } from "@/components/PeriodFilter";
import { MovementDelete } from "./MovementDelete";

export const metadata = { title: "Perfumes · Caixa" };

const KIND: Record<string, { label: string; tone: "good" | "bad" | "neutral" }> = {
  venda: { label: "Venda", tone: "good" },
  compra: { label: "Compra", tone: "bad" },
  ajuste: { label: "Ajuste", tone: "neutral" },
};

export default async function CaixaPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await pageUserArea("perfumes");
  const p = await searchParams;
  const today = todayIso();
  const f = { start: sp(p, "start") ?? `${today.slice(0, 4)}-01-01`, end: sp(p, "end") ?? today };
  const db = getDb();
  const [resumo, movs] = await Promise.all([perfumeCashSummary(db, f), listPerfumeMovements(db, f)]);

  return (
    <div className="space-y-4">
      <PageHeader title="Caixa" back="/perfumes" subtitle="Entradas (vendas) e saídas (compras) no período." />
      <PeriodFilter start={f.start} end={f.end} showParty={false} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Receita (vendas)" value={formatCents(resumo.receita)} hint={`${resumo.unidadesVendidas} un. · ${resumo.vendas} vendas`} tone="good" />
        <Stat label="Compras" value={formatCents(resumo.compras)} tone="bad" />
        <Stat label="Lucro das vendas" value={formatCents(resumo.lucro)} tone={resumo.lucro >= 0 ? "good" : "bad"} />
        <Stat label="Saldo em caixa" value={formatCents(resumo.saldoCaixa)} hint="Receita − compras" tone={resumo.saldoCaixa >= 0 ? "good" : "bad"} />
      </div>

      <Card title="Extrato">
        {movs.length ? (
          <Table head={["Data", "Perfume", "Tipo", "Qtd", "Valor", ""]}>
            {movs.map((m) => {
              const k = KIND[m.kind];
              const signed = m.kind === "venda" ? m.totalCents : m.kind === "compra" ? -m.totalCents : 0;
              return (
                <tr key={m.id}>
                  <td className="whitespace-nowrap">{formatDateBR(m.date)}</td>
                  <td>
                    {m.perfumeName}
                    {m.soldByName && <div className="text-xs text-[var(--muted)]">por {m.soldByName}</div>}
                    {m.notes && <div className="text-xs text-[var(--muted)]">{m.notes}</div>}
                  </td>
                  <td>
                    <Badge tone={k.tone}>{k.label}</Badge>
                  </td>
                  <td className="num">{m.kind === "ajuste" ? (m.qty > 0 ? `+${m.qty}` : m.qty) : m.qty}</td>
                  <td className={`num font-semibold ${signed > 0 ? "text-[var(--good)]" : signed < 0 ? "text-[var(--bad)]" : "text-[var(--muted)]"}`}>
                    {signed === 0 ? "—" : `${signed > 0 ? "+" : "−"}${formatCents(Math.abs(signed))}`}
                  </td>
                  <td>
                    <MovementDelete id={m.id} />
                  </td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty>Nenhum movimento no período.</Empty>
        )}
      </Card>
    </div>
  );
}
