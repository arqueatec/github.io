import { getDb } from "@/db";
import { pageUser } from "@/server/page";
import { activeUsers } from "@/server/services/finance";
import { PageHeader } from "@/components/ui";
import { SaleForm } from "./SaleForm";

export const metadata = { title: "Venda de animais" };

export default async function VendaPage({ searchParams }: { searchParams: Promise<{ tags?: string }> }) {
  const user = await pageUser();
  const { tags } = await searchParams;
  const users = await activeUsers(getDb());
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Venda de animais" back="/baixas" subtitle="Dá baixa nos animais e lança a receita (rateada entre as partes)." />
      <SaleForm users={users} currentUserId={user.id} initialTags={tags ? tags.split(",") : []} />
    </div>
  );
}
