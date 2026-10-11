import Link from "next/link";
import { getDb } from "@/db";
import { pageUser, sp } from "@/server/page";
import { listReimbursements } from "@/server/services/finance";
import { getLockedUntil } from "@/server/services/locks";
import { formatDateBR } from "@/domain/dates";
import { formatCents } from "@/domain/money";
import { Card, Empty, LinkButton, PageHeader, Table } from "@/components/ui";
import { PeriodFilter, exportQuery } from "@/components/PeriodFilter";
import { METHOD_LABEL } from "@/lib/labels";

export const metadata = { title: "Reembolsos" };

export default async function ReembolsosPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await pageUser();
  const p = await searchParams;
  const db = getDb();
  const f = { start: sp(p, "start"), end: sp(p, "end"), party: sp(p, "party") as "A" | "B" | null };
  const [rows, lockedUntil] = await Promise.all([listReimbursements(db, f), getLockedUntil(db)]);
  return (
    <div>
      <PageHeader
        title="Reembolsos"
        back="/financeiro"
        actions={
          <>
            <LinkButton href="/financeiro/reembolsos/novo">+ Reembolso</LinkButton>
            <LinkButton href={`/api/export/reembolsos?format=csv&${exportQuery(f)}`} variant="secondary" prefetch={false}>CSV</LinkButton>
          </>
        }
      />
      <PeriodFilter {...f} />
      <Card>
        {rows.length ? (
          <Table head={["Data", "De → Para", "Pago por", "Forma", "Valor", ""]}>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{formatDateBR(r.date)}</td>
                <td>
                  Parte {r.fromParty} → Parte {r.fromParty === "A" ? "B" : "A"}
                  {r.notes && <div className="text-xs text-[var(--muted)]">{r.notes}</div>}
                </td>
                <td>{r.paidByName}</td>
                <td>{METHOD_LABEL[r.method] ?? r.method}</td>
                <td className="num">{formatCents(r.amountCents)}</td>
                <td>
                  {r.createdBy === user.id && !(lockedUntil && r.date <= lockedUntil) ? (
                    <Link className="link text-xs" href={`/financeiro/reembolsos/${r.id}`}>
                      editar
                    </Link>
                  ) : lockedUntil && r.date <= lockedUntil ? (
                    "🔒"
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Nenhum reembolso no período.</Empty>
        )}
      </Card>
    </div>
  );
}
