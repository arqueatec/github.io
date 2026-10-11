import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { pageUser } from "@/server/page";
import { genealogy, getAnimal } from "@/server/services/animals";
import { listLots } from "@/server/services/admin";
import { PageHeader } from "@/components/ui";
import { AnimalForm } from "@/components/AnimalForm";

export default async function EditarAnimal({ params }: { params: Promise<{ id: string }> }) {
  await pageUser();
  const id = Number((await params).id);
  const db = getDb();
  const [a, g, lots] = await Promise.all([getAnimal(db, id), genealogy(db, id), listLots(db, true)]);
  if (!a || !g) notFound();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={`Editar ${a.tag}`} back={`/animais/${id}`} />
      <AnimalForm
        lots={lots}
        initial={{
          id: a.id,
          tag: a.tag,
          sex: a.sex,
          breed: a.breed,
          birthDate: a.birthDate,
          birthDateEstimated: a.birthDateEstimated,
          motherTag: g.mother?.tag ?? null,
          fatherTag: g.father?.tag ?? null,
          category: a.category,
          lotId: a.lotId,
          entryDate: a.entryDate,
          notes: a.notes,
        }}
      />
    </div>
  );
}
