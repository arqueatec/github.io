import { getDb } from "@/db";
import { pageUser } from "@/server/page";
import { listAnimals } from "@/server/services/animals";
import { PageHeader } from "@/components/ui";
import { BreedingForm } from "./BreedingForm";

export default async function CoberturaPage({ searchParams }: { searchParams: Promise<{ ewe?: string }> }) {
  await pageUser();
  const { ewe } = await searchParams;
  const ewes = await listAnimals(getDb(), { status: "ativo", sex: "F" });
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Cobertura / estação de monta" back="/reproducao" subtitle="Previsão de parto: cobertura + 150 dias." />
      <BreedingForm
        initialEwes={ewe ? [ewe] : []}
        ewes={ewes.map((e) => ({ tag: e.tag, category: e.category, lotId: e.lotId, lotName: e.lotName }))}
      />
    </div>
  );
}
