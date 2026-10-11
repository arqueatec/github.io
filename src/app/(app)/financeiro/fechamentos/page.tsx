import { getDb } from "@/db";
import { pageUser } from "@/server/page";
import { listLocks } from "@/server/services/locks";
import { computeBalance } from "@/server/services/finance";
import { describeBalance } from "@/domain/ledger";
import { formatDateBR } from "@/domain/dates";
import { formatCents } from "@/domain/money";
import { Badge, Card, Empty, PageHeader, Table } from "@/components/ui";
import { CloseForm, ReopenButton } from "./LockForms";

export const metadata = { title: "Fechamentos" };

export default async function FechamentosPage() {
  const user = await pageUser();
  const db = getDb();
  const [locks, balance] = await Promise.all([listLocks(db), computeBalance(db)]);
  const d = describeBalance(balance);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Fechamentos de período"
        back="/financeiro"
        subtitle="Ao registrar um acerto, os lançamentos até a data ficam travados. Somente o administrador reabre."
      />
      <Card title="Fechar período (acerto)">
        <p className="mb-3 text-sm">
          Saldo atual: <b>{d.debtor ? `Parte ${d.debtor} deve ${formatCents(d.amountCents)}` : "acertado"}</b>. O ideal é fechar após o reembolso que zera o saldo; se houver saldo, ele é registrado e segue para o próximo período.
        </p>
        <CloseForm />
      </Card>
      <Card title="Histórico">
        {locks.length ? (
          <Table head={["Travado até", "Saldo na data", "Por", "Situação", ""]}>
            {locks.map((l) => {
              const ld = describeBalance(l.balanceCents);
              return (
                <tr key={l.id}>
                  <td className="font-semibold">{formatDateBR(l.lockedUntil)}</td>
                  <td>{ld.debtor ? `${ld.debtor} devia ${formatCents(ld.amountCents)}` : "zerado"}</td>
                  <td>
                    {l.createdByName}
                    {l.notes && <div className="text-xs text-[var(--muted)]">{l.notes}</div>}
                  </td>
                  <td>{l.reopenedAt ? <Badge tone="warn">Reaberto: {l.reopenReason}</Badge> : <Badge tone="good">🔒 Fechado</Badge>}</td>
                  <td>{!l.reopenedAt && user.role === "admin" && <ReopenButton id={l.id} />}</td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty>Nenhum período fechado.</Empty>
        )}
      </Card>
    </div>
  );
}
