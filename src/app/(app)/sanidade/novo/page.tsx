import { getDb } from "@/db";
import { pageUser } from "@/server/page";
import { listLots } from "@/server/services/admin";
import { PageHeader } from "@/components/ui";
import { HealthForm } from "./HealthForm";

export const metadata = { title: "Sanidade" };

export default async function NovaSanidade({ searchParams }: { searchParams: Promise<{ tags?: string; product?: string; type?: string }> }) {
  await pageUser();
  const p = await searchParams;
  const lots = await listLots(getDb(), true);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Vacina, vermifugação ou tratamento" back="/sanidade" />
      <HealthForm
        lots={lots.map((l) => ({ id: l.id, name: l.name, animals: l.animals }))}
        initialTags={p.tags ? p.tags.split(",").filter(Boolean) : []}
        initialProduct={p.product ?? ""}
        initialType={(["vacina", "vermifugacao", "tratamento", "outro"].includes(p.type ?? "") ? p.type : "vermifugacao") as "vermifugacao"}
      />
    </div>
  );
}
