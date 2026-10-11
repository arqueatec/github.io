import { getDb } from "@/db";
import { pageUser } from "@/server/page";
import { listLots } from "@/server/services/admin";
import { PageHeader } from "@/components/ui";
import { AnimalForm } from "@/components/AnimalForm";

export const metadata = { title: "Novo animal" };

export default async function NovoAnimal({ searchParams }: { searchParams: Promise<{ tag?: string }> }) {
  await pageUser();
  const { tag } = await searchParams;
  const lots = await listLots(getDb(), true);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Cadastrar animal" back="/animais" subtitle="Para vários animais em sequência, use o Inventário rápido." />
      <AnimalForm lots={lots} defaultTag={tag} />
    </div>
  );
}
