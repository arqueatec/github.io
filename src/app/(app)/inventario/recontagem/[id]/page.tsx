import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { pageUser } from "@/server/page";
import { countComparison } from "@/server/services/inventory";
import { formatDateBR } from "@/domain/dates";
import { Card, PageHeader, Stat } from "@/components/ui";
import { CountScanner } from "./CountScanner";

export default async function CountPage({ params }: { params: Promise<{ id: string }> }) {
  await pageUser();
  const id = Number((await params).id);
  const cmp = await countComparison(getDb(), id).catch(() => null);
  if (!cmp) notFound();
  const closed = cmp.count.status !== "aberta";
  const result = cmp.count.result as { resolution?: string | null } | null;
  return (
    <div className="space-y-4">
      <PageHeader title={`Recontagem de ${formatDateBR(cmp.count.date)}`} back="/inventario/recontagem" subtitle={closed ? "Concluída" : "Em andamento — leia os brincos dos animais no curral"} />
      <div className="grid grid-cols-3 gap-2">
        <Stat label="No sistema" value={cmp.expectedTotal} />
        <Stat label="Contados" value={cmp.seen.length} />
        <Stat label="Divergências" value={cmp.missing.length + cmp.unexpected.length} tone={cmp.missing.length + cmp.unexpected.length ? "bad" : "good"} />
      </div>
      {!closed && <CountScanner countId={id} />}
      <Card title={`Faltando no curral (${cmp.missing.length})`}>
        <p className="mb-2 text-xs text-[var(--muted)]">Ativos no sistema mas não contados. Verifique se morreram, foram vendidos ou estão em outro piquete e registre a baixa.</p>
        <div className="flex flex-wrap gap-1">
          {cmp.missing.map((m) => (
            <Link key={m.id} href={`/animais/${m.id}`} className="badge badge-bad">
              {m.tag}
            </Link>
          ))}
        </div>
      </Card>
      <Card title={`Contados mas não esperados (${cmp.unexpected.length})`}>
        <ul className="space-y-1 text-sm">
          {cmp.unexpected.map((u) => (
            <li key={u.tag} className="flex items-center justify-between">
              <span>
                <b>{u.tag}</b> — {u.reason}
              </span>
              {u.animalId ? (
                <Link className="link text-xs" href={`/animais/${u.animalId}`}>
                  abrir
                </Link>
              ) : (
                <Link className="link text-xs" href={`/animais/novo?tag=${encodeURIComponent(u.tag)}`}>
                  cadastrar
                </Link>
              )}
            </li>
          ))}
        </ul>
      </Card>
      {closed && result?.resolution && (
        <Card title="Resolução registrada">
          <p className="whitespace-pre-wrap text-sm">{result.resolution}</p>
        </Card>
      )}
    </div>
  );
}
