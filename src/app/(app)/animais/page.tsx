import Link from "next/link";
import { getDb } from "@/db";
import { pageUser, sp, spInt } from "@/server/page";
import { listAnimals } from "@/server/services/animals";
import { listLots } from "@/server/services/admin";
import { ageLabel, todayIso } from "@/domain/dates";
import { Badge, Empty, LinkButton, PageHeader, Table } from "@/components/ui";
import { CATEGORY_LABEL, STATUS_LABEL, categoryLabel } from "@/lib/labels";

export const metadata = { title: "Rebanho" };

export default async function AnimaisPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await pageUser();
  const p = await searchParams;
  const db = getDb();
  const filter = { q: sp(p, "q"), status: sp(p, "status") ?? "ativo", category: sp(p, "category"), sex: sp(p, "sex"), lotId: spInt(p, "lotId") };
  const [rows, lots] = await Promise.all([listAnimals(db, filter), listLots(db)]);
  const today = todayIso();
  const qs = new URLSearchParams(Object.entries({ ...filter, lotId: filter.lotId ? String(filter.lotId) : "" }).filter(([, v]) => v) as [string, string][]);
  return (
    <div>
      <PageHeader
        title="Rebanho"
        subtitle={`${rows.length} animal(is) ${filter.status === "todos" ? "no total" : STATUS_LABEL[filter.status]?.toLowerCase() ?? ""}`}
        actions={
          <>
            <LinkButton href="/animais/novo">+ Animal</LinkButton>
            <LinkButton href={`/api/export/animais?format=csv${filter.lotId ? `&lotId=${filter.lotId}` : ""}`} variant="secondary" prefetch={false}>
              CSV
            </LinkButton>
          </>
        }
      />
      <form className="card mb-4 grid grid-cols-2 gap-2 sm:grid-cols-6" method="get">
        <input name="q" defaultValue={filter.q ?? ""} placeholder="Brinco ou obs." className="input col-span-2" />
        <select name="status" defaultValue={filter.status} className="select">
          <option value="todos">Todas situações</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select name="category" defaultValue={filter.category ?? ""} className="select">
          <option value="">Categoria</option>
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select name="sex" defaultValue={filter.sex ?? ""} className="select">
          <option value="">Sexo</option>
          <option value="F">Fêmea</option>
          <option value="M">Macho</option>
        </select>
        <select name="lotId" defaultValue={filter.lotId ?? ""} className="select">
          <option value="">Lote</option>
          {lots.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <button className="btn btn-primary col-span-2 sm:col-span-6">Filtrar</button>
      </form>
      {rows.length === 0 ? (
        <Empty>
          Nenhum animal encontrado. {filter.q && <Link className="link" href={`/animais/novo?tag=${encodeURIComponent(filter.q)}`}>Cadastrar brinco {filter.q}</Link>}
        </Empty>
      ) : (
        <div className="card">
          <Table head={["Brinco", "Categoria", "Sexo", "Idade", "Lote", "Situação"]}>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>
                  <Link className="link font-semibold" href={`/animais/${a.id}`}>
                    {a.tag}
                  </Link>
                </td>
                <td>{categoryLabel(a.category, a.sex)}</td>
                <td>{a.sex}</td>
                <td className="whitespace-nowrap">{ageLabel(a.birthDate, a.exitDate ?? today, a.birthDateEstimated)}</td>
                <td>{a.lotName ?? "—"}</td>
                <td>
                  <Badge tone={a.status === "ativo" ? "good" : a.status === "morto" ? "bad" : "neutral"}>{STATUS_LABEL[a.status]}</Badge>
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}
      <p className="mt-2 text-xs text-[var(--muted)]">{qs.toString() && "Filtros aplicados."}</p>
    </div>
  );
}
