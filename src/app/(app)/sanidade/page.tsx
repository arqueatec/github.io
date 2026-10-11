import Link from "next/link";
import { getDb } from "@/db";
import { pageUser } from "@/server/page";
import { getAlerts, listHealthEvents, listWeighings } from "@/server/services/health";
import { formatDateBR, todayIso } from "@/domain/dates";
import { formatKg } from "@/domain/money";
import { Badge, Card, Empty, LinkButton, PageHeader, Table } from "@/components/ui";
import { HEALTH_LABEL } from "@/lib/labels";

export const metadata = { title: "Sanidade" };

export default async function SanidadePage() {
  await pageUser();
  const db = getDb();
  const [events, alerts, weights] = await Promise.all([listHealthEvents(db, 2000), getAlerts(db, todayIso(), 45), listWeighings(db)]);
  // agrupa aplicações em lote
  const batches = new Map<string, { date: string; type: string; product: string | null; dose: string | null; next: string | null; until: string | null; tags: { id: number; tag: string; famacha: number | null }[] }>();
  for (const e of events) {
    const k = e.batchId ?? `single-${e.id}`;
    const b = batches.get(k) ?? { date: e.date, type: e.type, product: e.product, dose: e.dose, next: e.nextDoseDate, until: e.withdrawalUntil, tags: [] };
    b.tags.push({ id: e.animalId, tag: e.tag, famacha: e.famacha });
    batches.set(k, b);
  }
  return (
    <div className="space-y-4">
      <PageHeader
        title="Sanidade e manejo"
        actions={
          <>
            <LinkButton href="/sanidade/novo">+ Aplicação</LinkButton>
            <LinkButton href="/sanidade/pesagem" variant="secondary">Pesagem</LinkButton>
            <LinkButton href="/api/export/sanidade?format=csv" variant="secondary" prefetch={false}>CSV</LinkButton>
          </>
        }
      />
      <Card title="Próximas doses (45 dias)">
        {alerts.doses.length ? (
          <ul className="space-y-2 text-sm">
            {alerts.doses.map((d) => (
              <li key={`${d.product}${d.date}`} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <b>{HEALTH_LABEL[d.type]}</b> {d.product} · {d.tags.length} animal(is)
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={d.overdue ? "bad" : "warn"}>{formatDateBR(d.date)}</Badge>
                  <Link className="link text-xs" href={`/sanidade/novo?tags=${encodeURIComponent(d.tags.map((t) => t.tag).join(","))}&product=${encodeURIComponent(d.product)}&type=${d.type}`}>
                    aplicar
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Sem doses programadas.</Empty>
        )}
      </Card>
      <Card title="Aplicações">
        {batches.size ? (
          <Table head={["Data", "Tipo", "Produto", "Animais", "Carência até", "Próxima"]}>
            {[...batches.values()].slice(0, 100).map((b, i) => {
              const fam = b.tags.filter((t) => t.famacha);
              return (
                <tr key={i}>
                  <td className="whitespace-nowrap">{formatDateBR(b.date)}</td>
                  <td>{HEALTH_LABEL[b.type]}</td>
                  <td>
                    {b.product ?? "—"}
                    {b.dose && <div className="text-xs text-[var(--muted)]">{b.dose}</div>}
                  </td>
                  <td className="text-xs">
                    {b.tags.length === 1 ? (
                      <Link className="link" href={`/animais/${b.tags[0].id}`}>
                        {b.tags[0].tag}
                      </Link>
                    ) : (
                      `${b.tags.length} animais`
                    )}
                    {fam.length > 0 && <div className="text-[var(--muted)]">FAMACHA médio {(fam.reduce((s, t) => s + (t.famacha ?? 0), 0) / fam.length).toFixed(1)} ({fam.filter((t) => (t.famacha ?? 0) >= 4).length} com grau ≥ 4)</div>}
                  </td>
                  <td>{b.until ? formatDateBR(b.until) : "—"}</td>
                  <td>{b.next ? formatDateBR(b.next) : "—"}</td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty>Nenhuma aplicação registrada.</Empty>
        )}
      </Card>
      <Card title="Pesagens recentes">
        {weights.length ? (
          <Table head={["Data", "Brinco", "Peso", "ECC"]}>
            {weights.slice(0, 60).map((w) => (
              <tr key={w.id}>
                <td>{formatDateBR(w.date)}</td>
                <td>
                  <Link className="link" href={`/animais/${w.animalId}`}>
                    {w.tag}
                  </Link>
                </td>
                <td className="num">{formatKg(w.weightG)}</td>
                <td className="num">{w.bodyScore ?? "—"}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Nenhuma pesagem.</Empty>
        )}
      </Card>
    </div>
  );
}
