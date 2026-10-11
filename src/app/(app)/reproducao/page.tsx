import Link from "next/link";
import { getDb } from "@/db";
import { pageUser } from "@/server/page";
import { expectedBirths, listBirths, listBreedings, unweanedLambs } from "@/server/services/reproduction";
import { ageLabel, diffDays, formatDateBR, todayIso } from "@/domain/dates";
import { Badge, Card, Empty, LinkButton, PageHeader, Table } from "@/components/ui";
import { BIRTH_TYPE_LABEL } from "@/lib/labels";
import { DeleteButton } from "@/components/forms";

export const metadata = { title: "Reprodução" };

export default async function ReproducaoPage() {
  await pageUser();
  const db = getDb();
  const today = todayIso();
  const [expected, births, breedings, lambs] = await Promise.all([expectedBirths(db, today, 200), listBirths(db, { limit: 60 }), listBreedings(db, 60), unweanedLambs(db)]);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Reprodução"
        actions={
          <>
            <LinkButton href="/reproducao/cobertura" variant="secondary">Cobertura</LinkButton>
            <LinkButton href="/reproducao/diagnostico" variant="secondary">Diagnóstico</LinkButton>
            <LinkButton href="/reproducao/parto">Parto</LinkButton>
            <LinkButton href="/reproducao/desmame" variant="secondary">Desmame</LinkButton>
          </>
        }
      />
      <Card title={`Partos previstos (${expected.length})`}>
        <p className="mb-2 text-xs text-[var(--muted)]">Previsão = data da cobertura + 150 dias. Some da lista quando o parto é lançado ou o diagnóstico dá vazia.</p>
        {expected.length ? (
          <Table head={["Matriz", "Cobertura", "Previsão", ""]}>
            {expected.map((e) => {
              const d = diffDays(today, e.expected);
              return (
                <tr key={e.breedingId}>
                  <td>
                    <Link className="link font-semibold" href={`/animais/${e.eweId}`}>
                      {e.eweTag}
                    </Link>
                  </td>
                  <td>{formatDateBR(e.date)}</td>
                  <td className="whitespace-nowrap">
                    {formatDateBR(e.expected)}
                    {e.expectedEnd && ` a ${formatDateBR(e.expectedEnd)}`} <Badge tone={d < 0 ? "bad" : d <= 10 ? "warn" : "info"}>{d < 0 ? `${-d} d atraso` : `${d} d`}</Badge>
                  </td>
                  <td>
                    <Link className="link text-xs" href={`/reproducao/parto?ewe=${encodeURIComponent(e.eweTag)}`}>
                      lançar parto
                    </Link>
                  </td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty>Nenhum parto previsto. Registre as coberturas para gerar previsões.</Empty>
        )}
      </Card>
      <Card title={`Crias aguardando desmame (${lambs.length})`}>
        {lambs.length ? (
          <div className="flex flex-wrap gap-1">
            {lambs.map((l) => (
              <Link key={l.id} className="badge" href={`/animais/${l.id}`}>
                {l.tag} · {ageLabel(l.birthDate, today)}
              </Link>
            ))}
          </div>
        ) : (
          <Empty>Nenhuma cria em aleitamento.</Empty>
        )}
      </Card>
      <Card title="Partos recentes">
        {births.length ? (
          <Table head={["Data", "Matriz", "Reprodutor", "Vivas", "Mortas", "Tipo", "Crias", ""]}>
            {births.map((b) => (
              <tr key={b.id}>
                <td className="whitespace-nowrap">{formatDateBR(b.date)}</td>
                <td>
                  <Link className="link" href={`/animais/${b.eweId}`}>
                    {b.eweTag}
                  </Link>
                </td>
                <td>{b.ramTag ?? "—"}</td>
                <td className="num">{b.bornAlive}</td>
                <td className="num">{b.bornDead}</td>
                <td>{BIRTH_TYPE_LABEL[b.birthType] ?? b.birthType}</td>
                <td className="text-xs">{b.lambs ?? "—"}</td>
                <td>{!b.lambs && <DeleteButton small url={`/api/births/${b.id}`} confirmText="Excluir este parto?" />}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Nenhum parto registrado.</Empty>
        )}
      </Card>
      <Card title="Coberturas recentes">
        {breedings.length ? (
          <Table head={["Data", "Matriz", "Reprodutor", "Estação", "Previsão"]}>
            {breedings.map((b) => (
              <tr key={b.id}>
                <td>{formatDateBR(b.date)}</td>
                <td>
                  <Link className="link" href={`/animais/${b.eweId}`}>
                    {b.eweTag}
                  </Link>
                </td>
                <td>{b.ramTag ?? "—"}</td>
                <td>{b.seasonName ?? "—"}</td>
                <td>{formatDateBR(new Date(new Date(b.date).getTime() + 150 * 864e5).toISOString().slice(0, 10))}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Nenhuma cobertura registrada.</Empty>
        )}
      </Card>
    </div>
  );
}
