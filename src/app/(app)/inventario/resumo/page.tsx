import Link from "next/link";
import { getDb } from "@/db";
import { pageUser } from "@/server/page";
import { inventoryProgress } from "@/server/services/inventory";
import { listAnimals } from "@/server/services/animals";
import { Card, PageHeader, Stat, Table } from "@/components/ui";
import { CATEGORY_LABEL, SPECIES_HERD_LABEL, categoryLabel } from "@/lib/labels";
import { SPECIES, categoriesFor, type Species } from "@/domain/species";

export default async function ResumoInventario() {
  await pageUser();
  const db = getDb();
  const [p, active] = await Promise.all([inventoryProgress(db), listAnimals(db, { status: "ativo" })]);
  const n = (species: Species, c: string, sex: "F" | "M") =>
    p.byCategory.find((r) => r.species === species && r.category === c && r.sex === sex)?.n ?? 0;
  const noLot = active.filter((a) => !a.lotId).length;
  const speciesWithAnimals = SPECIES.filter((s) => p.bySpecies[s] > 0);
  const toShow = speciesWithAnimals.length ? speciesWithAnimals : (["ovino"] as Species[]);
  return (
    <div className="space-y-4">
      <PageHeader title="Resumo do inventário" back="/inventario" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Ativos no sistema" value={p.total} hint={`meta estimada: ${p.target}`} />
        <Stat label="Ovelhas" value={p.bySpecies.ovino} />
        <Stat label="Gado" value={p.bySpecies.bovino} />
        <Stat label="Sem data de nascimento" value={p.unknownBirth} hint="idade desconhecida" />
        <Stat label="Sem lote" value={noLot} />
      </div>
      {toShow.map((species) => {
        const cats = categoriesFor(species).map((c) => ({ c, F: n(species, c, "F"), M: n(species, c, "M") }));
        const tot = cats.reduce((s, r) => s + r.F + r.M, 0);
        return (
          <Card key={species} title={`${SPECIES_HERD_LABEL[species]} — por categoria (${tot})`}>
            <Table head={["Categoria", "Fêmeas", "Machos", "Total"]}>
              {cats.map((r) => (
                <tr key={r.c}>
                  <td>
                    <Link className="link" href={`/animais?species=${species}&category=${r.c}`}>
                      {CATEGORY_LABEL[r.c]}
                    </Link>
                  </td>
                  <td className="num">{r.F}</td>
                  <td className="num">{r.M}</td>
                  <td className="num font-semibold">{r.F + r.M}</td>
                </tr>
              ))}
            </Table>
          </Card>
        );
      })}
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
