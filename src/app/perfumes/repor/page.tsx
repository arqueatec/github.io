import Link from "next/link";
import { getDb } from "@/db";
import { pageUserArea } from "@/server/page";
import { listPerfumes } from "@/server/services/perfumes";
import { PageHeader } from "@/components/ui";
import { RestockForm } from "./RestockForm";

export const metadata = { title: "Repor estoque" };

export default async function ReporPage() {
  await pageUserArea("perfumes");
  const db = getDb();
  const perfumesList = await listPerfumes(db, true);
  return (
    <div>
      <PageHeader
        title="Repor estoque (compra)"
        back="/perfumes"
        subtitle="Entra no estoque e sai do caixa."
        actions={<Link className="btn btn-secondary" href="/perfumes/produtos/novo">+ Novo perfume</Link>}
      />
      <RestockForm perfumes={perfumesList.map((p) => ({ id: p.id, name: p.name, stock: p.stock, costCents: p.costCents }))} />
    </div>
  );
}
