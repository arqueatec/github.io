import Link from "next/link";
import { getDb } from "@/db";
import { pageUser } from "@/server/page";
import { inventoryProgress } from "@/server/services/inventory";
import { listAnimals } from "@/server/services/animals";
import { Card, PageHeader, Stat, Table } from "@/components/ui";
import { CATEGORY_LABEL, categoryLabel } from "@/lib/labels";

export default async function ResumoInventario() {
  await pageUser();
  const db = getDb();
  const [p, active] = await Promise.all([inventoryProgress(db), listAnimals(db, { status: "ativo" })]);
  const byCat = Object.keys(CATEGORY_LABEL).map((c) => ({
    c,
    F: p.byCategory.find((r) => r.category === c && r.sex === "F")?.n ?? 0,
    M: p.byCategory.find((r) => r.category === c && r.sex === "M")?.n ?? 0,
  }));
  const noLot = active.filter((a) => !a.lotId).length;
  return (
    <div className="space-y-4">
      <PageHeader title="Resumo do inventário" back="/inventario" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Ativos no sistema" value={p.total} hint={`meta estimada: ${p.target}`} />
        <Stat label="Do inventário inicial" value={p.inventoried} />
        <Stat label="Sem data de nascimento" value={p.unknownBirth} hint="idade desconhecida" />
        <Stat label="Sem lote" value={noLot} />
      </div>
      <Card title="Por categoria">
        <Table head={["Categoria", "Fêmeas", "Machos", "Total"]}>
          {byCat.map((r) => (
            <tr key={r.c}>
              <td>
                <Link className="link" href={`/animais?category=${r.c}`}>
                  {CATEGORY_LABEL[r.c]}
                </Link>
              </td>
              <td className="num">{r.F}</td>
              <td className="num">{r.M}</td>
              <td className="num font-semibold">{r.F + r.M}</td>
            </tr>
          ))}
          <tr>
            <td className="font-semibold">Total</td>
            <td className="num">{byCat.reduce((s, r) => s + r.F, 0)}</td>
            <td className="num">{byCat.reduce((s, r) => s + r.M, 0)}</td>
            <td className="num font-bold">{p.total}</td>
          </tr>
        </Table>
      </Card>
      <Card title="Brincos ativos">
        <div className="flex flex-wrap gap-1">
          {active.map((a) => (
            <Link key={a.id} href={`/animais/${a.id}`} className="badge" title={categoryLabel(a.category, a.sex)}>
              {a.tag}
            </Link>
          ))}
        </div>
      </Card>
      <p className="text-xs text-[var(--muted)]">
        Animais do inventário inicial não têm histórico anterior ao cadastro: índices como intervalo entre partos só aparecem a partir do 2º parto registrado no sistema.
      </p>
    </div>
  );
}
