import Link from "next/link";
import { getDb } from "@/db";
import { pageUser, sp, spInt } from "@/server/page";
import { listRevenues, activeCategories } from "@/server/services/finance";
import { getLockedUntil } from "@/server/services/locks";
import { listLots } from "@/server/services/admin";
import { formatDateBR } from "@/domain/dates";
import { formatCents } from "@/domain/money";
import { Badge, Card, Empty, LinkButton, PageHeader, Table } from "@/components/ui";
import { PeriodFilter, exportQuery } from "@/components/PeriodFilter";

export const metadata = { title: "Receitas" };

export default async function ReceitasPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await pageUser();
  const p = await searchParams;
  const db = getDb();
  const f = { start: sp(p, "start"), end: sp(p, "end"), party: sp(p, "party") as "A" | "B" | null, lotId: spInt(p, "lotId"), categoryId: spInt(p, "categoryId") };
  const [rows, lots, cats, lockedUntil] = await Promise.all([listRevenues(db, f), listLots(db), activeCategories(db, "receita"), getLockedUntil(db)]);
  const total = rows.reduce((s, r) => s + r.amountCents, 0);
  const q = exportQuery(f);
  return (
    <div>
      <PageHeader
        title="Receitas"
        back="/financeiro"
        subtitle={`${rows.length} lançamento(s) · total ${formatCents(total)}`}
        actions={
          <>
            <LinkButton href="/financeiro/receitas/nova">+ Receita</LinkButton>
            <LinkButton href={`/api/export/receitas?format=csv&${q}`} variant="secondary" prefetch={false}>CSV</LinkButton>
            <LinkButton href={`/api/export/receitas?format=pdf&${q}`} variant="secondary" prefetch={false}>PDF</LinkButton>
          </>
        }
      />
      <PeriodFilter
        {...f}
        lots={lots}
        extra={
          <label className="field">
            <span className="field-label text-xs">Categoria</span>
            <select name="categoryId" defaultValue={f.categoryId ?? ""} className="select">
              <option value="">Todas</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        }
      />
      <Card>
        {rows.length ? (
          <Table head={["Data", "Categoria", "Descrição", "Recebido por", "Valor", ""]}>
            {rows.map((r) => {
              const mine = r.createdBy === user.id && !(lockedUntil && r.date <= lockedUntil);
              return (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{formatDateBR(r.date)}</td>
                  <td>{r.categoryName}</td>
                  <td>
                    {r.description ?? "—"}
                    {r.lotName && <div className="text-xs text-[var(--muted)]">{[r.lotName].filter(Boolean).join(" · ")}</div>}
                    {r.receiptId && (
                      <a className="link text-xs" href={`/api/attachments/${r.receiptId}`} target="_blank" rel="noreferrer">
                        📎 comprovante
                      </a>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    {r.receivedByName} <Badge tone={r.party === "A" ? "info" : "warn"}>{r.party}</Badge>
                  </td>
                  <td className="num">{formatCents(r.amountCents)}</td>
                  <td>
                    {mine ? (
                      <Link className="link text-xs" href={`/financeiro/receitas/${r.id}`}>
                        editar
                      </Link>
                    ) : lockedUntil && r.date <= lockedUntil ? (
                      <span title="Período fechado">🔒</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty>Nenhuma receita no período.</Empty>
        )}
      </Card>
    </div>
  );
}
