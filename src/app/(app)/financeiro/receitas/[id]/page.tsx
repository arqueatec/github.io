import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { pageUser } from "@/server/page";
import { financeFormContext } from "@/server/financeContext";
import { getRevenue } from "@/server/services/finance";
import { canModifyFinancial } from "@/domain/policy";
import { PageHeader } from "@/components/ui";
import { EntryForm } from "@/components/EntryForm";

export default async function EditarReceita({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  const r = await getRevenue(getDb(), Number((await params).id));
  if (!r || r.deletedAt) notFound();
  const ctx = await financeFormContext("receita");
  const can = canModifyFinancial(user, r, ctx.lockedUntil);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Editar receita" back="/financeiro/receitas" />
      {can.ok ? (
        <EntryForm
          kind="receita"
          currentUserId={user.id}
          {...ctx}
          initial={{ id: r.id, date: r.date, amountCents: r.amountCents, categoryId: r.categoryId, description: r.description, userId: r.receivedByUserId, lotId: r.lotId, receiptId: r.receiptId }}
        />
      ) : (
        <p className="card text-sm">{can.reason}</p>
      )}
    </div>
  );
}
