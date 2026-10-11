import { getDb } from "@/db";
import { pageUser } from "@/server/page";
import { activeUsers, computeBalance } from "@/server/services/finance";
import { getLockedUntil } from "@/server/services/locks";
import { PageHeader } from "@/components/ui";
import { ReimbursementForm } from "@/components/ReimbursementForm";

export default async function NovoReembolso() {
  const user = await pageUser();
  const db = getDb();
  const [users, balance, lockedUntil] = await Promise.all([activeUsers(db), computeBalance(db), getLockedUntil(db)]);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Reembolso entre as partes" back="/financeiro/reembolsos" subtitle="Quita total ou parcialmente o saldo restante após a compensação automática." />
      <ReimbursementForm users={users} currentUserId={user.id} balance={balance} lockedUntil={lockedUntil} />
    </div>
  );
}
