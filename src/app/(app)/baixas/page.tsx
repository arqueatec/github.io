import Link from "next/link";
import { getDb } from "@/db";
import { pageUser, sp } from "@/server/page";
import { listExits } from "@/server/services/exits";
import { ageLabel, formatDateBR } from "@/domain/dates";
import { formatCents, formatKg } from "@/domain/money";
import { Badge, Card, Empty, LinkButton, PageHeader, Table } from "@/components/ui";
import { CATEGORY_LABEL, EXIT_LABEL } from "@/lib/labels";

export const metadata = { title: "Baixas" };

export default async function BaixasPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await pageUser();
  const type = sp(await searchParams, "type");
  const rows = await listExits(getDb(), type);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Baixas"
        actions={
          <>
            <LinkButton href="/baixas/venda">+ Venda</LinkButton>
            <LinkButton href="/baixas/nova" variant="secondary">+ Morte/abate/consumo</LinkButton>
            <LinkButton href="/api/export/baixas?format=csv" variant="secondary" prefetch={false}>CSV</LinkButton>
          </>
        }
      />
      <div className="flex flex-wrap gap-2">
        <Link href="/baixas" className={`badge ${!type ? "badge-info" : ""}`}>Todas</Link>
        {Object.entries(EXIT_LABEL).map(([k, v]) => (
          <Link key={k} href={`/baixas?type=${k}`} className={`badge ${type === k ? "badge-info" : ""}`}>
            {v}
          </Link>
        ))}
      </div>
      <Card>
        {rows.length ? (
          <Table head={["Data", "Tipo", "Brinco", "Categoria", "Idade", "Causa / comprador", "Peso", "Valor"]}>
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap">{formatDateBR(e.date)}</td>
                <td>
                  <Badge tone={e.type === "morte" ? "bad" : e.type === "venda" ? "good" : "neutral"}>{EXIT_LABEL[e.type]}</Badge>
                </td>
                <td>
                  <Link className="link" href={`/animais/${e.animalId}`}>
                    {e.tag}
                  </Link>
                </td>
                <td>{e.category ? CATEGORY_LABEL[e.category] : "—"}</td>
                <td className="whitespace-nowrap">{ageLabel(e.birthDate, e.date)}</td>
                <td>{e.cause ?? e.buyer ?? "—"}</td>
                <td className="num">{formatKg(e.weightG)}</td>
                <td className="num">{e.totalCents ? formatCents(e.totalCents) : "—"}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Nenhuma baixa registrada.</Empty>
        )}
      </Card>
    </div>
  );
}
