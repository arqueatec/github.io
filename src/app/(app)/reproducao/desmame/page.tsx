import { getDb } from "@/db";
import { pageUser } from "@/server/page";
import { unweanedLambs } from "@/server/services/reproduction";
import { PageHeader } from "@/components/ui";
import { WeaningForm } from "./WeaningForm";

export default async function DesmamePage() {
  await pageUser();
  const lambs = await unweanedLambs(getDb());
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Desmame" back="/reproducao" subtitle="Marque as crias desmamadas e informe o peso. Elas passam a borrego(a)." />
      <WeaningForm lambs={lambs.map((l) => ({ tag: l.tag, sex: l.sex, birthDate: l.birthDate }))} />
    </div>
  );
}
