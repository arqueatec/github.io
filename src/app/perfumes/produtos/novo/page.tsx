import { pageUserArea } from "@/server/page";
import { PageHeader } from "@/components/ui";
import { PerfumeForm } from "../PerfumeForm";

export const metadata = { title: "Novo perfume" };

export default async function NovoPerfumePage() {
  await pageUserArea("perfumes");
  return (
    <div>
      <PageHeader title="Novo perfume" back="/perfumes/produtos" />
      <PerfumeForm />
    </div>
  );
}
