import { getDb } from "@/db";
import { pageUserArea } from "@/server/page";
import { listPerfumes, perfumeSellers } from "@/server/services/perfumes";
import { PageHeader } from "@/components/ui";
import { SaleForm } from "./SaleForm";

export const metadata = { title: "Vender perfume" };

export default async function VenderPage() {
  const user = await pageUserArea("perfumes");
  const db = getDb();
  const [perfumesList, sellers] = await Promise.all([listPerfumes(db, true), perfumeSellers(db)]);
  return (
    <div>
      <PageHeader title="Registrar venda" back="/perfumes" subtitle="Baixa o estoque e entra no caixa." />
      <SaleForm
        perfumes={perfumesList.map((p) => ({ id: p.id, name: p.name, stock: p.stock, priceCents: p.priceCents }))}
        sellers={sellers}
        currentUserId={user.id}
        currentIsSeller={user.area === "perfumes"}
      />
    </div>
  );
}
