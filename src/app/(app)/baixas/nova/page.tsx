import { pageUser } from "@/server/page";
import { PageHeader } from "@/components/ui";
import { ExitForm } from "./ExitForm";

export default async function NovaBaixa({ searchParams }: { searchParams: Promise<{ tag?: string }> }) {
  await pageUser();
  const { tag } = await searchParams;
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Morte, abate ou consumo próprio" back="/baixas" subtitle="Para venda use a tela de venda (gera a receita)." />
      <ExitForm initialTag={tag ?? ""} />
    </div>
  );
}
