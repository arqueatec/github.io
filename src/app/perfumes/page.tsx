import Link from "next/link";
import { getDb } from "@/db";
import { pageUserArea } from "@/server/page";
import { perfumeCashSummary, perfumeStockSummary, listPerfumeMovements, LOW_STOCK } from "@/server/services/perfumes";
import { formatCents } from "@/domain/money";
import { formatDateBR, todayIso } from "@/domain/dates";
import { Badge, Card, Empty, Stat } from "@/components/ui";

export const metadata = { title: "Perfumes" };

export default async function PerfumesHome() {
  const user = await pageUserArea("perfumes");
  const db = getDb();
  const [caixa, estoque, movs] = await Promise.all([perfumeCashSummary(db), perfumeStockSummary(db), listPerfumeMovements(db, {})]);
  const vendas = movs.filter((m) => m.kind === "venda").slice(0, 8);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Olá, {user.name.split(" ")[0]}</h1>
        <p className="text-sm text-[var(--muted)]">{formatDateBR(todayIso())} · Revenda de perfumes</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link href="/perfumes/caixa" className="col-span-2">
          <Stat label="Saldo em caixa" value={formatCents(caixa.saldoCaixa)} hint="Vendas recebidas − compras" tone={caixa.saldoCaixa >= 0 ? "good" : "bad"} />
        </Link>
        <Link href="/perfumes/caixa">
          <Stat label="Lucro das vendas" value={formatCents(caixa.lucro)} hint={`${caixa.unidadesVendidas} un. vendidas`} tone="good" />
        </Link>
        <Link href="/perfumes/produtos">
          <Stat label="Em estoque" value={estoque.units} hint={`${estoque.count} perfumes · ${formatCents(estoque.valueCost)} a custo`} />
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {[
          ["/perfumes/vender", "🏷️", "Vender"],
          ["/perfumes/repor", "📦", "Repor"],
          ["/perfumes/produtos", "🧴", "Produtos"],
          ["/perfumes/caixa", "💰", "Caixa"],
          ["/perfumes/produtos/novo", "➕", "Novo"],
        ].map(([href, icon, label]) => (
          <Link key={href} href={href} className="tile">
            <span className="text-2xl" aria-hidden>
              {icon}
            </span>
            {label}
          </Link>
        ))}
      </div>

      {estoque.low.length > 0 && (
        <Card title={`Estoque baixo (${estoque.low.length})`} actions={<Link className="link text-sm" href="/perfumes/repor">Repor</Link>}>
          <ul className="divide-y divide-[var(--border)]">
            {estoque.low.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <Link className="link" href={`/perfumes/produtos/${p.id}`}>
                  {p.name}
                </Link>
                <Badge tone={p.stock === 0 ? "bad" : "warn"}>{p.stock === 0 ? "esgotado" : `${p.stock} un.`}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--muted)]">Mostrando itens com {LOW_STOCK} unidades ou menos.</p>
        </Card>
      )}

      <Card title="Últimas vendas" actions={<Link className="link text-sm" href="/perfumes/caixa">Ver caixa</Link>}>
        {vendas.length ? (
          <ul className="divide-y divide-[var(--border)]">
            {vendas.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{m.perfumeName}</span>
                  <span className="text-[var(--muted)]"> · {m.qty}× · {formatDateBR(m.date)}</span>
                  {m.soldByName && <span className="text-xs text-[var(--muted)]"> — {m.soldByName}</span>}
                </span>
                <span className="whitespace-nowrap font-semibold">{formatCents(m.totalCents)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nenhuma venda registrada ainda. Toque em “Vender” para começar.</Empty>
        )}
      </Card>
    </div>
  );
}
