import { pageUser } from "@/server/page";
import { PageHeader } from "@/components/ui";
import { WeighingForm } from "./WeighingForm";

export default async function PesagemPage({ searchParams }: { searchParams: Promise<{ tags?: string }> }) {
  await pageUser();
  const { tags } = await searchParams;
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Pesagem e escore corporal" back="/sanidade" subtitle="Digite o brinco, o peso e Enter para o próximo." />
      <WeighingForm initialTags={tags ? tags.split(",") : []} />
    </div>
  );
}
