import { getDb } from "@/db";
import { pageUser } from "@/server/page";
import { listLots } from "@/server/services/admin";
import { PageHeader } from "@/components/ui";
import { BirthForm } from "./BirthForm";

export const metadata = { title: "Registrar parto" };

export default async function PartoPage({ searchParams }: { searchParams: Promise<{ ewe?: string }> }) {
  await pageUser();
  const { ewe } = await searchParams;
  const lots = await listLots(getDb(), true);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Registrar parto" back="/reproducao" subtitle="As crias com brinco são cadastradas automaticamente com mãe e pai." />
      <BirthForm initialEwe={ewe ?? ""} lots={lots.map((l) => ({ id: l.id, name: l.name }))} />
    </div>
  );
}
