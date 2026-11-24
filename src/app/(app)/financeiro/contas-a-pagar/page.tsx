import Link from "next/link";
import { getDb } from "@/db";
import { pageUser } from "@/server/page";
import { activeUsers, listPayables } from "@/server/services/finance";
import { getLockedUntil } from "@/server/services/locks";
import { formatDateBR, diffDays, todayIso } from "@/domain/dates";
import { formatCents } from "@/domain/money";
import { Badge, Card, Empty, LinkButton, PageHeader, Stat, Table } from "@/components/ui";
import { FINANCE_SPECIES_LABEL } from "@/lib/labels";
import { PayButton } from "./PayButton";

export const metadata = { title: "Contas a pagar" };

export default async function ContasAPagarPage() {
  await pageUser();
  const db = getDb();
  const today = todayIso();
  const [rows, users, lockedUntil] = await Promise.all([listPayables(db), activeUsers(db), getLockedUntil(db)]);
  const total = rows.reduce((s, r) => s + r.amountCents, 0);
  const overdue = rows.filter((r) => r.dueDate && r.dueDate < today);
  const overdueTotal = overdue.reduce((s, r) => s + r.amountCents, 0);
  const next30 = rows.filter((r) => r.dueDate && r.dueDate >= today && diffDays(today, r.dueDate) <= 30);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Contas a pagar"
        back="/financeiro"
        subtitle="Despesas registradas que ainda não foram pagas. Não entram no acerto entre as partes até serem pagas."
        actions={<LinkButton href="/financeiro/despesas/nova">+ Lançar conta</LinkButton>}
      />
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Total a pagar" value={formatCents(total)} hint={`${rows.length} conta(s)`} />
        <Stat label="Vencidas" value={formatCents(overdueTotal)} hint={`${overdue.length} conta(s)`} tone={overdue.length ? "bad" : undefined} />
        <Stat label="Vencem em 30 dias" value={next30.length} />
      </div>
      <Card>
        {rows.length ? (
          <Table head={["Vencimento", "Categoria", "Descrição", "Espécie", "Valor", "", ""]}>
            {rows.map((r) => {
              const d = r.dueDate ? diffDays(today, r.dueDate) : null;
              const locked = lockedUntil && r.dueDate != null && r.dueDate <= lockedUntil;
              return (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">
                    {r.dueDate ? formatDateBR(r.dueDate) : "—"}{" "}
                    {d !== null && <Badge tone={d < 0 ? "bad" : d <= 7 ? "warn" : "info"}>{d < 0 ? `${-d} d vencida` : d === 0 ? "hoje" : `em ${d} d`}</Badge>}
                  </td>
                  <td>{r.categoryName}</td>
                  <td>
                    {r.description ?? "—"}
                    {r.paidCents != null && (
                      <div className="text-xs text-[var(--muted)]">Parcela de uma compra parcelada{r.paidDate ? ` — lançada em ${formatDateBR(r.paidDate)}` : ""}</div>
                    )}
                    {(r.animalTag || r.lotName) && <div className="text-xs text-[var(--muted)]">{[r.animalTag && `animal ${r.animalTag}`, r.lotName].filter(Boolean).join(" · ")}</div>}
                    {r.receiptId && (
                      <a className="link text-xs" href={`/api/attachments/${r.receiptId}`} target="_blank" rel="noreferrer">
                        📎 comprovante
                      </a>
                    )}
                  </td>
                  <td className="text-xs">{FINANCE_SPECIES_LABEL[r.species]}</td>
                  <td className="num font-semibold">{formatCents(r.amountCents)}</td>
                  <td>
                    <PayButton id={r.id} amount={r.amountCents} users={users} dueDate={r.dueDate} />
                  </td>
                  <td>
                    <Link className="link text-xs" href={`/financeiro/despesas/${r.id}`}>
                      editar
                    </Link>
                  </td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty>Nenhuma conta a pagar. Para registrar uma, lance uma despesa e escolha a situação “A pagar”.</Empty>
        )}
      </Card>
      {lockedUntil && <p className="text-xs text-[var(--muted)]">Período fechado até {formatDateBR(lockedUntil)}: contas com vencimento até essa data não podem ser pagas nem editadas.</p>}
    </div>
  );
}
