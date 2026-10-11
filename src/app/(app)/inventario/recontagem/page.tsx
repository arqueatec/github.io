import Link from "next/link";
import { getDb } from "@/db";
import { pageUser } from "@/server/page";
import { listCounts } from "@/server/services/inventory";
import { listLots } from "@/server/services/admin";
import { formatDateBR } from "@/domain/dates";
import { Badge, Card, Empty, PageHeader, Table } from "@/components/ui";
import { NewCountForm } from "./NewCountForm";

export default async function RecontagemPage() {
  await pageUser();
  const db = getDb();
  const [counts, lots] = await Promise.all([listCounts(db), listLots(db, true)]);
  const open = counts.find((c) => c.status === "aberta");
  return (
    <div className="space-y-4">
      <PageHeader title="Recontagens" back="/inventario" subtitle="Confira o efetivo do sistema com o que está no curral e registre divergências." />
      {open ? (
        <Card title="Recontagem em andamento">
          <p className="text-sm">
            Iniciada em {formatDateBR(open.date)} {open.lotName && `· ${open.lotName}`} · {open.seen} brinco(s) lido(s)
          </p>
          <Link href={`/inventario/recontagem/${open.id}`} className="btn btn-primary mt-3 w-full">
            Continuar recontagem
          </Link>
        </Card>
      ) : (
        <Card title="Nova recontagem">
          <NewCountForm lots={lots.map((l) => ({ id: l.id, name: l.name }))} />
        </Card>
      )}
      <Card title="Histórico">
        {counts.length ? (
          <Table head={["Data", "Lote", "Esperado", "Contado", "Faltando", "Não esperados", ""]}>
            {counts.map((c) => {
              const r = c.result as { expected: number; seen: number; missing: string[]; unexpected: unknown[] } | null;
              return (
                <tr key={c.id}>
                  <td>{formatDateBR(c.date)}</td>
                  <td>{c.lotName ?? "Todos"}</td>
                  <td className="num">{r?.expected ?? "—"}</td>
                  <td className="num">{r?.seen ?? c.seen}</td>
                  <td className="num">{r ? <Badge tone={r.missing.length ? "bad" : "good"}>{r.missing.length}</Badge> : "—"}</td>
                  <td className="num">{r ? <Badge tone={r.unexpected.length ? "warn" : "good"}>{r.unexpected.length}</Badge> : "—"}</td>
                  <td>
                    <Link className="link" href={`/inventario/recontagem/${c.id}`}>
                      {c.status === "aberta" ? "continuar" : "ver"}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty>Nenhuma recontagem realizada.</Empty>
        )}
      </Card>
    </div>
  );
}
