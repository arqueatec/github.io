import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { pageUserArea } from "@/server/page";
import { getPerfume } from "@/server/services/perfumes";
import { intParam } from "@/server/http";
import { formatCents } from "@/domain/money";
import { Card, PageHeader } from "@/components/ui";
import { PerfumeForm } from "../PerfumeForm";
import { AdjustStock } from "./AdjustStock";

export const metadata = { title: "Editar perfume" };

export default async function EditarPerfumePage({ params }: { params: Promise<{ id: string }> }) {
  await pageUserArea("perfumes");
  const { id } = await params;
  const p = await getPerfume(getDb(), intParam(id));
  if (!p) notFound();
  return (
    <div className="space-y-4">
      <PageHeader title={`Editar: ${p.name}`} back="/perfumes/produtos" subtitle={`Em estoque: ${p.stock} un. · ${formatCents(p.stock * p.costCents)} a custo`} />
      <PerfumeForm initial={{ id: p.id, name: p.name, costCents: p.costCents, priceCents: p.priceCents, active: p.active }} />
      <Card title="Ajustar estoque (recontagem)">
        <p className="mb-3 text-sm text-[var(--muted)]">Use quando conferir o estoque físico e o número estiver diferente. Não mexe no caixa.</p>
        <AdjustStock id={p.id} current={p.stock} />
      </Card>
    </div>
  );
}
