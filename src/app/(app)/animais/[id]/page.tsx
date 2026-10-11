import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { pageUser } from "@/server/page";
import { animalTimeline, genealogy, getAnimal } from "@/server/services/animals";
import { eweDetail } from "@/server/services/dashboard";
import { listWeighings } from "@/server/services/health";
import { listExits } from "@/server/services/exits";
import { ageLabel, formatDateBR, todayIso } from "@/domain/dates";
import { expectedBirthDate } from "@/domain/indices";
import { formatCents, formatKg } from "@/domain/money";
import { Badge, Card, Empty, LinkButton, PageHeader, Stat, Table } from "@/components/ui";
import { DeleteButton } from "@/components/forms";
import { EXIT_LABEL, ORIGIN_LABEL, PREG_LABEL, SEX_LABEL, STATUS_LABEL, categoryLabel } from "@/lib/labels";
import { UndoExitButton } from "./UndoExitButton";

type Brief = { id: number; tag: string } | null;

function AnimalLink({ a, empty = "desconhecido" }: { a: Brief; empty?: string }) {
  return a ? (
    <Link className="link" href={`/animais/${a.id}`}>
      {a.tag}
    </Link>
  ) : (
    <span className="text-[var(--muted)]">{empty}</span>
  );
}

export default async function AnimalPage({ params }: { params: Promise<{ id: string }> }) {
  await pageUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = getDb();
  const a = await getAnimal(db, id);
  if (!a) notFound();
  const today = todayIso();
  const [gen, timeline, weights, exits] = await Promise.all([genealogy(db, id), animalTimeline(db, id), listWeighings(db, id), listExits(db)]);
  const isEwe = a.sex === "F" && (a.category === "matriz" || a.category === "descarte" || timeline.some((t) => t.kind === "parto"));
  const ewe = isEwe ? await eweDetail(db, id, a.exitDate ?? today) : null;
  const exit = exits.find((e) => e.animalId === id);
  const active = a.status === "ativo";

  return (
    <div className="space-y-4">
      <PageHeader
        back="/animais"
        title={`Brinco ${a.tag}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-1">
            <Badge tone="info">{categoryLabel(a.category, a.sex)}</Badge>
            <Badge tone={active ? "good" : "bad"}>{STATUS_LABEL[a.status]}</Badge>
            {a.lotName && <Badge>{a.lotName}</Badge>}
          </span>
        }
        actions={<LinkButton href={`/animais/${id}/editar`} variant="secondary">Editar</LinkButton>}
      />

      {active && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {a.sex === "F" && (
            <>
              <Link className="tile" href={`/reproducao/parto?ewe=${encodeURIComponent(a.tag)}`}>🍼 Parto</Link>
              <Link className="tile" href={`/reproducao/cobertura?ewe=${encodeURIComponent(a.tag)}`}>❤️ Cobertura</Link>
              <Link className="tile" href={`/reproducao/diagnostico?ewe=${encodeURIComponent(a.tag)}`}>🔍 Diagnóstico</Link>
            </>
          )}
          <Link className="tile" href={`/sanidade/novo?tags=${encodeURIComponent(a.tag)}`}>💉 Sanidade</Link>
          <Link className="tile" href={`/sanidade/pesagem?tags=${encodeURIComponent(a.tag)}`}>⚖️ Pesagem</Link>
          <Link className="tile" href={`/baixas/nova?tag=${encodeURIComponent(a.tag)}`}>📤 Baixa</Link>
        </div>
      )}

      <Card title="Dados">
        <div className="flex gap-4">
          {a.photoId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/attachments/${a.photoId}`} alt={`Foto do brinco ${a.tag}`} className="h-28 w-28 shrink-0 rounded-lg object-cover" />
          )}
          <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-[var(--muted)]">Sexo</dt><dd>{SEX_LABEL[a.sex]}</dd></div>
            <div><dt className="text-xs text-[var(--muted)]">Raça</dt><dd>{a.breed ?? "—"}</dd></div>
            <div>
              <dt className="text-xs text-[var(--muted)]">Nascimento</dt>
              <dd>
                {a.birthDate ? `${formatDateBR(a.birthDate)}${a.birthDateEstimated ? " (estimada)" : ""}` : "desconhecido"}
              </dd>
            </div>
            <div><dt className="text-xs text-[var(--muted)]">Idade</dt><dd>{ageLabel(a.birthDate, a.exitDate ?? today, a.birthDateEstimated)}</dd></div>
            <div><dt className="text-xs text-[var(--muted)]">Origem</dt><dd>{ORIGIN_LABEL[a.origin]}</dd></div>
            <div><dt className="text-xs text-[var(--muted)]">Entrada</dt><dd>{formatDateBR(a.entryDate)}</dd></div>
            {a.exitDate && <div><dt className="text-xs text-[var(--muted)]">Saída</dt><dd>{formatDateBR(a.exitDate)}</dd></div>}
          </dl>
        </div>
        {a.notes && <p className="mt-3 text-sm">{a.notes}</p>}
        {exit && (
          <div className="mt-3 rounded-lg bg-[var(--surface-2)] p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span>
                <b>{EXIT_LABEL[exit.type]}</b> em {formatDateBR(exit.date)}
                {exit.cause && ` — ${exit.cause}`}
                {exit.buyer && ` — ${exit.buyer}`}
                {exit.totalCents ? ` — ${formatCents(exit.totalCents)}` : ""}
                {exit.weightG ? ` — ${formatKg(exit.weightG)}` : ""}
              </span>
              <UndoExitButton exitId={exit.id} />
            </div>
          </div>
        )}
      </Card>

      <Card title="Genealogia">
        {gen && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-[var(--surface-2)] p-3">
                <div className="text-xs text-[var(--muted)]">Mãe</div>
                <div className="font-semibold"><AnimalLink a={gen.mother} empty="desconhecida" /></div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  Avó: <AnimalLink a={gen.maternalGrandmother} empty="—" /> · Avô: <AnimalLink a={gen.maternalGrandfather} empty="—" />
                </div>
              </div>
              <div className="rounded-lg bg-[var(--surface-2)] p-3">
                <div className="text-xs text-[var(--muted)]">Pai</div>
                <div className="font-semibold"><AnimalLink a={gen.father} /></div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  Avó: <AnimalLink a={gen.paternalGrandmother} empty="—" /> · Avô: <AnimalLink a={gen.paternalGrandfather} empty="—" />
                </div>
              </div>
            </div>
            {!gen.mother && !gen.father && a.origin !== "nascimento" && (
              <p className="text-xs text-[var(--muted)]">Animal anterior ao sistema: genealogia desconhecida.</p>
            )}
            <div>
              <div className="mb-1 text-xs text-[var(--muted)]">Descendentes ({gen.offspring.length})</div>
              <div className="flex flex-wrap gap-1">
                {gen.offspring.map((o) => (
                  <Link key={o.id} href={`/animais/${o.id}`} className={`badge ${o.status === "ativo" ? "badge-good" : ""}`}>
                    {o.tag} {o.sex}
                  </Link>
                ))}
                {!gen.offspring.length && <span className="text-xs text-[var(--muted)]">nenhum</span>}
              </div>
            </div>
          </div>
        )}
      </Card>

      {ewe && (
        <>
          <Card title="Desempenho da matriz">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Partos" value={ewe.stats.births} hint={ewe.stats.firstBirth ? `desde ${formatDateBR(ewe.stats.firstBirth)}` : "nenhum registrado"} />
              <Stat label="Crias nascidas" value={ewe.stats.lambsBorn} hint={`${ewe.stats.lambsBornAlive} vivas`} />
              <Stat label="Crias desmamadas" value={ewe.stats.lambsWeaned} hint={`${ewe.stats.weanedKg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg no desmame`} />
              <Stat label="Prolificidade" value={ewe.stats.prolificacy?.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) ?? "—"} hint="crias / parto" />
              <Stat
                label="Intervalo entre partos"
                value={ewe.stats.avgInterval ? `${Math.round(ewe.stats.avgInterval)} d` : "—"}
                hint={ewe.stats.intervals.length ? `média de ${ewe.stats.intervals.length} intervalo(s)` : "precisa de 2 partos registrados"}
              />
              <Stat label="Partos / ano" value={ewe.stats.birthsPerYear?.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) ?? "—"} hint={ewe.stats.birthsPerYear === null ? "histórico < 6 meses" : "no período observado"} />
              <Stat label="Mortes pré-desmame" value={ewe.stats.lambsDiedPreWeaning} />
              <Stat
                label="Próximo parto"
                value={ewe.lastBreeding && (!ewe.stats.lastBirth || ewe.lastBreeding.date > ewe.stats.lastBirth) ? formatDateBR(expectedBirthDate(ewe.lastBreeding.date)) : "—"}
                hint={ewe.lastBreeding ? `cobertura em ${formatDateBR(ewe.lastBreeding.date)}` : "sem cobertura"}
              />
            </div>
            {a.origin === "inventario" && (
              <p className="mt-3 text-xs text-[var(--muted)]">
                Matriz do inventário inicial: partos anteriores a {formatDateBR(a.entryDate)} não estão registrados, portanto os índices refletem só o histórico no sistema.
              </p>
            )}
          </Card>

          <Card title={`Partos (${ewe.births.length})`}>
            {ewe.births.length ? (
              <Table head={["Data", "Intervalo", "Vivas", "Mortas", "Crias"]}>
                {[...ewe.births].reverse().map((b) => (
                  <tr key={b.id}>
                    <td className="whitespace-nowrap">{formatDateBR(b.date)}</td>
                    <td className="num">{b.intervalDays ? `${b.intervalDays} d` : "—"}</td>
                    <td className="num">{b.bornAlive}</td>
                    <td className="num">{b.bornDead}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {b.lambs.map((l) => (
                          <Link key={l.id} href={`/animais/${l.id}`} className={`badge ${l.status === "ativo" ? "badge-good" : l.status === "morto" ? "badge-bad" : ""}`} title={STATUS_LABEL[l.status]}>
                            {l.tag} {l.sex}
                            {l.weaning?.weightG ? ` · ${(l.weaning.weightG / 1000).toFixed(1)}kg` : ""}
                            {l.exit ? ` · ${EXIT_LABEL[l.exit.type]}` : ""}
                          </Link>
                        ))}
                        {b.lambs.length < b.bornAlive && <span className="badge">{b.bornAlive - b.lambs.length} sem brinco</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>Nenhum parto registrado.</Empty>
            )}
            {ewe.pregnancies.length > 0 && (
              <div className="mt-3 text-sm">
                <div className="mb-1 text-xs text-[var(--muted)]">Diagnósticos de gestação</div>
                <div className="flex flex-wrap gap-1">
                  {ewe.pregnancies.map((p, i) => (
                    <Badge key={i} tone={p.result === "prenhe" ? "good" : p.result === "vazia" ? "bad" : "warn"}>
                      {formatDateBR(p.date)}: {PREG_LABEL[p.result]}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card title="Custos associados">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Despesas diretas" value={formatCents(ewe.costs.directTotal)} hint={`${ewe.costs.direct.length} lançamento(s) vinculados a esta matriz`} />
              <Stat label="Rateio estimado das despesas gerais" value={formatCents(ewe.costs.estimatedShare)} hint={`${ewe.costs.daysInHerd} dias no rebanho × custo médio por cabeça/dia`} />
            </div>
            {ewe.costs.direct.length > 0 && (
              <ul className="mt-3 divide-y divide-[var(--border)] text-sm">
                {ewe.costs.direct.map((e) => (
                  <li key={e.id} className="flex justify-between py-1">
                    <span>
                      {formatDateBR(e.date)} · {e.categoryName} {e.description && `— ${e.description}`}
                    </span>
                    <span className="tabular-nums">{formatCents(e.amountCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {weights.length > 0 && (
        <Card title="Pesagens e escore corporal">
          <Table head={["Data", "Peso", "ECC"]}>
            {weights.map((w) => (
              <tr key={w.id}>
                <td>{formatDateBR(w.date)}</td>
                <td className="num">{formatKg(w.weightG)}</td>
                <td className="num">{w.bodyScore ?? "—"}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Card title={`Histórico completo (${timeline.length})`}>
        <ol className="relative space-y-3 border-l border-[var(--border)] pl-4">
          {timeline.map((t, i) => (
            <li key={i} className="text-sm">
              <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-[var(--primary)]" aria-hidden />
              <div className="text-xs text-[var(--muted)]">{formatDateBR(t.date)}</div>
              <div className="font-medium">{t.title}</div>
              {t.detail && <div className="text-xs text-[var(--muted)]">{t.detail}</div>}
            </li>
          ))}
        </ol>
      </Card>

      <div className="flex justify-end">
        <DeleteButton
          url={`/api/animals/${id}`}
          label="Excluir cadastro"
          confirmText="Excluir este animal? Use apenas para cadastro feito por engano. Para morte/venda registre uma baixa."
          redirect="/animais"
        />
      </div>
    </div>
  );
}

