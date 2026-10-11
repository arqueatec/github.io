import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { pageUser } from "@/server/page";
import { activeUsers, computeBalance, getReimbursement } from "@/server/services/finance";
import { getLockedUntil } from "@/server/services/locks";
import { canModifyFinancial } from "@/domain/policy";
import { PageHeader } from "@/components/ui";
import { ReimbursementForm } from "@/components/ReimbursementForm";

export default async function EditarReembolso({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  const db = getDb();
  const r = await getReimbursement(db, Number((await params).id));
  if (!r || r.deletedAt) notFound();
  const [users, balance, lockedUntil] = await Promise.all([activeUsers(db), computeBalance(db), getLockedUntil(db)]);
  const can = canModifyFinancial(user, r, lockedUntil);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Editar reembolso" back="/financeiro/reembolsos" />
      {can.ok ? <ReimbursementForm users={users} currentUserId={user.id} balance={balance} lockedUntil={lockedUntil} initial={r} /> : <p className="card text-sm">{can.reason}</p>}
    </div>
  );
}
