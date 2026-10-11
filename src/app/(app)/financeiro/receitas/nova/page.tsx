import { pageUser } from "@/server/page";
import { financeFormContext } from "@/server/financeContext";
import { PageHeader } from "@/components/ui";
import { EntryForm } from "@/components/EntryForm";

export const metadata = { title: "Nova receita" };

export default async function NovaReceita() {
  const user = await pageUser();
  const ctx = await financeFormContext("receita");
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Nova receita" back="/financeiro/receitas" subtitle="Para venda de animais, prefira Baixas → Venda (dá baixa e lança a receita)." />
      <EntryForm kind="receita" currentUserId={user.id} {...ctx} />
    </div>
  );
}
