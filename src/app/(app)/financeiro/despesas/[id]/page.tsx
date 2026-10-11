import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { pageUser } from "@/server/page";
import { financeFormContext } from "@/server/financeContext";
import { getExpense } from "@/server/services/finance";
import { canModifyFinancial } from "@/domain/policy";
import { PageHeader } from "@/components/ui";
import { EntryForm } from "@/components/EntryForm";

export default async function EditarDespesa({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  const e = await getExpense(getDb(), Number((await params).id));
  if (!e || e.deletedAt) notFound();
  const ctx = await financeFormContext("despesa");
  const can = canModifyFinancial(user, e, ctx.lockedUntil);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Editar despesa" back="/financeiro/despesas" />
      {can.ok ? (
        <EntryForm
          kind="despesa"
          currentUserId={user.id}
          {...ctx}
          initial={{ id: e.id, date: e.date, amountCents: e.amountCents, categoryId: e.categoryId, description: e.description, userId: e.paidByUserId, animalTag: e.animalTag, lotId: e.lotId, receiptId: e.receiptId }}
        />
      ) : (
        <p className="card text-sm">{can.reason}</p>
      )}
    </div>
  );
}
