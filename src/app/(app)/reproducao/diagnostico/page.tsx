import { pageUser } from "@/server/page";
import { PageHeader } from "@/components/ui";
import { PregnancyForm } from "./PregnancyForm";

export default async function DiagnosticoPage({ searchParams }: { searchParams: Promise<{ ewe?: string }> }) {
  await pageUser();
  const { ewe } = await searchParams;
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Diagnóstico de gestação" back="/reproducao" subtitle="Opcional. Diagnóstico 'vazia' remove a previsão de parto." />
      <PregnancyForm initialEwe={ewe ?? ""} />
    </div>
  );
}
