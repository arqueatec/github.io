import { getDb } from "@/db";
import { pageAdmin, sp } from "@/server/page";
import { listAudit } from "@/server/services/admin";
import { Card, PageHeader, Table } from "@/components/ui";

export const metadata = { title: "Auditoria" };

const ENTITIES: Record<string, string> = {
  expense: "Despesa",
  revenue: "Receita",
  reimbursement: "Reembolso",
  animal_exit: "Baixa de animal",
  animal: "Animal",
  birth: "Parto",
  period_lock: "Fechamento",
  share_config: "Participação",
  user: "Usuário",
  animal_import: "Importação",
  inventory_count: "Recontagem",
};
const ACTIONS: Record<string, string> = { create: "criou", update: "alterou", delete: "excluiu", lock: "fechou", reopen: "reabriu" };

function diff(before: unknown, after: unknown) {
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return null;
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  return Object.keys(a)
    .filter((k) => !["updatedAt", "deletedAt", "createdAt"].includes(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .map((k) => `${k}: ${JSON.stringify(b[k])} → ${JSON.stringify(a[k])}`);
}

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await pageAdmin();
  const entity = sp(await searchParams, "entity");
  const rows = await listAudit(getDb(), { entity, limit: 300 });
  return (
    <div>
      <PageHeader title="Auditoria" back="/admin" subtitle="Criação, edição e exclusão de lançamentos financeiros, baixas e configurações." />
      <form method="get" className="card mb-4 flex gap-2">
        <select name="entity" defaultValue={entity ?? ""} className="select">
          <option value="">Tudo</option>
          {Object.entries(ENTITIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button className="btn btn-primary">Filtrar</button>
      </form>
      <Card>
        <Table head={["Quando", "Quem", "O quê", "Detalhes"]}>
          {rows.map((r) => {
            const d = r.action === "update" ? diff(r.before, r.after) : null;
            const snap = (r.after ?? r.before) as Record<string, unknown> | null;
            return (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-xs">{new Date(r.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                <td>{r.userName ?? "—"}</td>
                <td className="whitespace-nowrap">
                  {ACTIONS[r.action] ?? r.action} {ENTITIES[r.entity] ?? r.entity} #{r.entityId ?? ""}
                </td>
                <td className="max-w-md text-xs">
                  {d ? (
                    d.map((x) => <div key={x}>{x}</div>)
                  ) : (
                    <details>
                      <summary className="cursor-pointer text-[var(--primary)]">
                        {snap && "amountCents" in snap ? `R$ ${(Number(snap.amountCents) / 100).toFixed(2).replace(".", ",")} em ${snap.date}` : "ver registro"}
                      </summary>
                      <pre className="whitespace-pre-wrap break-all">{JSON.stringify(r.after ?? r.before, null, 1)}</pre>
                    </details>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </div>
  );
}
