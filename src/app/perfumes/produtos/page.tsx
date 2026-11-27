import Link from "next/link";
import { getDb } from "@/db";
import { pageUserArea } from "@/server/page";
import { listPerfumes, perfumeStockSummary, LOW_STOCK } from "@/server/services/perfumes";
import { formatCents } from "@/domain/money";
import { Badge, Card, Empty, LinkButton, PageHeader, Stat, Table } from "@/components/ui";
import { PerfumeImport } from "./PerfumeImport";

export const metadata = { title: "Perfumes · Produtos" };

export default async function ProdutosPage() {
  await pageUserArea("perfumes");
  const db = getDb();
  const [rows, resumo] = await Promise.all([listPerfumes(db), perfumeStockSummary(db)]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Produtos"
        back="/perfumes"
        subtitle={`${resumo.count} perfumes · ${resumo.units} un. em estoque`}
        actions={<LinkButton href="/perfumes/produtos/novo">+ Novo perfume</LinkButton>}
      />
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Em estoque" value={resumo.units} hint={`${resumo.count} itens`} />
        <Stat label="Valor a custo" value={formatCents(resumo.valueCost)} />
        <Stat label="Valor a preço" value={formatCents(resumo.valuePrice)} tone="good" />
      </div>

      <Card>
        {rows.length ? (
          <Table head={["Perfume", "Estoque", "Custo", "Preço", "Em estoque", ""]}>
            {rows.map((p) => (
              <tr key={p.id} className={p.active ? "" : "opacity-50"}>
                <td>
                  <span className="font-medium">{p.name}</span>
                  {!p.active && <span className="ml-1 text-xs text-[var(--muted)]">(inativo)</span>}
                </td>
                <td>
                  <Badge tone={p.stock === 0 ? "bad" : p.stock <= LOW_STOCK ? "warn" : "neutral"}>{p.stock}</Badge>
                </td>
                <td className="num">{formatCents(p.costCents)}</td>
                <td className="num">{formatCents(p.priceCents)}</td>
                <td className="num">{formatCents(p.valueCents)}</td>
                <td>
                  <Link className="link text-xs" href={`/perfumes/produtos/${p.id}`}>
                    editar
                  </Link>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Nenhum perfume cadastrado. Adicione um ou importe a lista abaixo.</Empty>
        )}
      </Card>

      <Card title="Importar lista (CSV)">
        <p className="mb-3 text-sm text-[var(--muted)]">
          Envie uma planilha com as colunas <code>nome;custo;preco;estoque</code>. Perfumes com o mesmo nome são atualizados; os novos são criados.
        </p>
        <PerfumeImport />
      </Card>
    </div>
  );
}
