import { getDb } from "@/db";
import { pageUser, sp } from "@/server/page";
import { getLedger, getShares } from "@/server/services/finance";
import { getLockedUntil } from "@/server/services/locks";
import { describeBalance, shareLabel } from "@/domain/ledger";
import { formatDateBR } from "@/domain/dates";
import { formatCents } from "@/domain/money";
import { Badge, Card, Empty, LinkButton, PageHeader, Table } from "@/components/ui";
import { PeriodFilter, exportQuery } from "@/components/PeriodFilter";

export const metadata = { title: "Extrato" };

function effectText(effect: number) {
  if (effect === 0) return "sem efeito";
  return effect > 0 ? `B deve +${formatCents(effect)}` : `A deve +${formatCents(-effect)}`;
}

export default async function ExtratoPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await pageUser();
  const p = await searchParams;
  const db = getDb();
  const f = { start: sp(p, "start"), end: sp(p, "end") };
  const [all, shares, lockedUntil] = await Promise.all([getLedger(db), getShares(db), getLockedUntil(db)]);
  const before = all.filter((l) => f.start && l.date < f.start);
  const opening = before.length ? before[before.length - 1].balance : 0;
  const lines = all.filter((l) => (!f.start || l.date >= f.start) && (!f.end || l.date <= f.end));
  const closing = lines.length ? lines[lines.length - 1].balance : opening;
  const d = describeBalance(closing);
  const q = exportQuery(f);
  return (
    <div>
      <PageHeader
        title="Extrato entre as partes"
        back="/financeiro"
        subtitle="Cada lançamento com sua divisão e o efeito no saldo. Saldo positivo = Parte B deve à Parte A."
        actions={
          <>
            <LinkButton href={`/api/export/extrato?format=csv&${q}`} variant="secondary" prefetch={false}>CSV</LinkButton>
            <LinkButton href={`/api/export/extrato?format=pdf&${q}`} variant="secondary" prefetch={false}>PDF</LinkButton>
          </>
        }
      />
      <PeriodFilter {...f} showParty={false} />
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs text-[var(--muted)]">Saldo {f.end ? `em ${formatDateBR(f.end)}` : "atual"}</div>
            <div className="text-2xl font-bold">{d.debtor ? `Parte ${d.debtor} deve ${formatCents(d.amountCents)} à Parte ${d.creditor}` : "Contas acertadas"}</div>
            {f.start && <div className="text-xs text-[var(--muted)]">Saldo de abertura em {formatDateBR(f.start)}: {formatCents(opening)}</div>}
          </div>
          <LinkButton href="/financeiro/reembolsos/novo">Quitar com reembolso</LinkButton>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Participações: {shares.map((s) => `desde ${formatDateBR(s.validFrom)} A ${shareLabel(s).A} / B ${shareLabel(s).B}`).join(" · ")}
          {lockedUntil && ` · Período fechado até ${formatDateBR(lockedUntil)}`}
        </p>
      </Card>
      <Card>
        {lines.length ? (
          <Table head={["Data", "Lançamento", "Quem", "Valor", "Fração A", "Fração B", "Efeito", "Saldo"]}>
            {[...lines].reverse().map((l) => (
              <tr key={`${l.kind}-${l.id}`} className={lockedUntil && l.date <= lockedUntil ? "opacity-70" : undefined}>
                <td className="whitespace-nowrap">{formatDateBR(l.date)}</td>
                <td>
                  <Badge tone={l.kind === "despesa" ? "bad" : l.kind === "receita" ? "good" : "info"}>{l.kind}</Badge>{" "}
                  <span className="text-xs">{[l.categoryName, l.description].filter(Boolean).join(" — ")}</span>
                </td>
                <td className="whitespace-nowrap text-xs">
                  {l.userName} ({l.party})
                </td>
                <td className="num">{formatCents(l.amountCents)}</td>
                <td className="num text-xs">{l.kind === "reembolso" ? "—" : formatCents(l.shareA)}</td>
                <td className="num text-xs">{l.kind === "reembolso" ? "—" : formatCents(l.shareB)}</td>
                <td className={`num text-xs ${l.effect > 0 ? "text-[var(--info)]" : "text-[var(--warn)]"}`}>{effectText(l.effect)}</td>
                <td className="num font-semibold">{formatCents(l.balance)}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Nenhum lançamento no período.</Empty>
        )}
      </Card>
      <p className="mt-3 text-xs text-[var(--muted)]">
        Regras: despesa paga por A → B passa a dever a fração de B; despesa paga por B → A passa a dever a fração de A; receita recebida por uma parte → ela deve à outra a fração da outra; reembolso abate o saldo. A fração de A é arredondada ao centavo (meio para cima) e a de B é o restante, de modo que cada lançamento fecha exatamente.
      </p>
    </div>
  );
}
