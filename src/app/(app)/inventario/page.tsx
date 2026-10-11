import Link from "next/link";
import { getDb } from "@/db";
import { pageUser } from "@/server/page";
import { inventoryProgress } from "@/server/services/inventory";
import { listLots } from "@/server/services/admin";
import { PageHeader } from "@/components/ui";
import { QuickInventory } from "./QuickInventory";

export const metadata = { title: "Inventário rápido" };

export default async function InventarioPage() {
  await pageUser();
  const db = getDb();
  const [progress, lots] = await Promise.all([inventoryProgress(db), listLots(db, true)]);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Inventário rápido"
        subtitle="Um animal por vez, direto no curral. Funciona sem sinal."
        actions={
          <>
            <Link href="/inventario/resumo" className="btn btn-secondary btn-sm">Resumo</Link>
            <Link href="/inventario/recontagem" className="btn btn-secondary btn-sm">Recontagem</Link>
          </>
        }
      />
      <QuickInventory lots={lots.map((l) => ({ id: l.id, name: l.name }))} initialTotal={progress.total} target={progress.target} />
    </div>
  );
}
