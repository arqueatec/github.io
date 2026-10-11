import { pageUser } from "@/server/page";
import { financeFormContext } from "@/server/financeContext";
import { PageHeader } from "@/components/ui";
import { EntryForm } from "@/components/EntryForm";

export const metadata = { title: "Nova despesa" };

export default async function NovaDespesa() {
  const user = await pageUser();
  const ctx = await financeFormContext("despesa");
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Nova despesa" back="/financeiro/despesas" subtitle="Toda despesa é comum e rateada entre as partes." />
      <EntryForm kind="despesa" currentUserId={user.id} {...ctx} />
    </div>
  );
}
