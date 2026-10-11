import type { Exec } from "@/db";
import { ageLabel, formatDateBR, todayIso } from "@/domain/dates";
import { describeBalance, type Party } from "@/domain/ledger";
import { formatCents } from "@/domain/money";
import { CATEGORY_LABEL, EXIT_LABEL, HEALTH_LABEL, METHOD_LABEL, ORIGIN_LABEL, SEX_LABEL, STATUS_LABEL, categoryLabel } from "@/lib/labels";
import { listAnimals } from "./animals";
import { dashboard, defaultPeriod } from "./dashboard";
import { listExits } from "./exits";
import { getLedger, listExpenses, listReimbursements, listRevenues } from "./finance";
import { listHealthEvents } from "./health";
import { listBirths } from "./reproduction";
import { centsCell } from "./importExport";
import { AppError } from "../errors";

export interface Report {
  title: string;
  columns: { key: string; label: string }[];
  rows: Record<string, string | number | null>[];
  /** Linhas extras de resumo para o PDF. */
  summary?: string[];
}

export interface ReportFilter {
  start?: string | null;
  end?: string | null;
  party?: Party | null;
  lotId?: number | null;
}

const kg = (g: number | null | undefined) => (g ? (g / 1000).toFixed(1).replace(".", ",") : "");

export const REPORT_KINDS = {
  animais: "Rebanho",
  despesas: "Despesas",
  receitas: "Receitas",
  reembolsos: "Reembolsos",
  extrato: "Extrato entre as partes",
  baixas: "Baixas",
  partos: "Partos",
  sanidade: "Sanidade",
  indicadores: "Indicadores",
  matrizes: "Ranking de matrizes",
} as const;
export type ReportKind = keyof typeof REPORT_KINDS;

export async function buildReport(db: Exec, kind: string, f: ReportFilter): Promise<Report> {
  const today = todayIso();
  const range = { start: f.start ?? null, end: f.end ?? null, party: f.party ?? null, lotId: f.lotId ?? null };
  switch (kind as ReportKind) {
    case "animais": {
      const rows = await listAnimals(db, { status: "todos", lotId: f.lotId });
      return {
        title: "Rebanho",
        columns: [
          { key: "tag", label: "Brinco" },
          { key: "sex", label: "Sexo" },
          { key: "category", label: "Categoria" },
          { key: "status", label: "Situação" },
          { key: "breed", label: "Raça" },
          { key: "birthDate", label: "Nascimento" },
          { key: "age", label: "Idade" },
          { key: "lot", label: "Lote" },
          { key: "origin", label: "Origem" },
          { key: "entryDate", label: "Entrada" },
          { key: "exitDate", label: "Saída" },
        ],
        rows: rows.map((a) => ({
          tag: a.tag,
          sex: SEX_LABEL[a.sex],
          category: categoryLabel(a.category, a.sex),
          status: STATUS_LABEL[a.status],
          breed: a.breed,
          birthDate: a.birthDate ? `${formatDateBR(a.birthDate)}${a.birthDateEstimated ? " (estimada)" : ""}` : "desconhecida",
          age: a.status === "ativo" ? ageLabel(a.birthDate, today, a.birthDateEstimated) : "",
          lot: a.lotName,
          origin: ORIGIN_LABEL[a.origin],
          entryDate: formatDateBR(a.entryDate),
          exitDate: a.exitDate ? formatDateBR(a.exitDate) : "",
        })),
        summary: [`${rows.filter((r) => r.status === "ativo").length} animais ativos de ${rows.length} cadastrados`],
      };
    }
    case "despesas": {
      const rows = await listExpenses(db, range);
      return {
        title: "Despesas",
        columns: [
          { key: "date", label: "Data" },
          { key: "category", label: "Categoria" },
          { key: "description", label: "Descrição" },
          { key: "amount", label: "Valor (R$)" },
          { key: "paidBy", label: "Pago por" },
          { key: "party", label: "Parte" },
          { key: "animal", label: "Animal" },
          { key: "lot", label: "Lote" },
        ],
        rows: rows.map((e) => ({
          date: formatDateBR(e.date),
          category: e.categoryName,
          description: e.description,
          amount: centsCell(e.amountCents),
          paidBy: e.paidByName,
          party: e.party,
          animal: e.animalTag,
          lot: e.lotName,
        })),
        summary: [`Total: ${formatCents(rows.reduce((s, e) => s + e.amountCents, 0))}`],
      };
    }
    case "receitas": {
      const rows = await listRevenues(db, range);
      return {
        title: "Receitas",
        columns: [
          { key: "date", label: "Data" },
          { key: "category", label: "Categoria" },
          { key: "description", label: "Descrição" },
          { key: "amount", label: "Valor (R$)" },
          { key: "receivedBy", label: "Recebido por" },
          { key: "party", label: "Parte" },
        ],
        rows: rows.map((r) => ({
          date: formatDateBR(r.date),
          category: r.categoryName,
          description: r.description,
          amount: centsCell(r.amountCents),
          receivedBy: r.receivedByName,
          party: r.party,
        })),
        summary: [`Total: ${formatCents(rows.reduce((s, e) => s + e.amountCents, 0))}`],
      };
    }
    case "reembolsos": {
      const rows = await listReimbursements(db, range);
      return {
        title: "Reembolsos entre as partes",
        columns: [
          { key: "date", label: "Data" },
          { key: "from", label: "De" },
          { key: "to", label: "Para" },
          { key: "amount", label: "Valor (R$)" },
          { key: "method", label: "Forma" },
          { key: "paidBy", label: "Pago por" },
          { key: "notes", label: "Obs." },
        ],
        rows: rows.map((r) => ({
          date: formatDateBR(r.date),
          from: `Parte ${r.fromParty}`,
          to: `Parte ${r.fromParty === "A" ? "B" : "A"}`,
          amount: centsCell(r.amountCents),
          method: METHOD_LABEL[r.method] ?? r.method,
          paidBy: r.paidByName,
          notes: r.notes,
        })),
      };
    }
    case "extrato": {
      const lines = (await getLedger(db)).filter((l) => (!f.start || l.date >= f.start) && (!f.end || l.date <= f.end));
      const last = lines.at(-1);
      const d = describeBalance(last?.balance ?? 0);
      return {
        title: "Extrato do acerto entre as partes",
        columns: [
          { key: "date", label: "Data" },
          { key: "kind", label: "Tipo" },
          { key: "description", label: "Descrição" },
          { key: "who", label: "Quem" },
          { key: "party", label: "Parte" },
          { key: "amount", label: "Valor (R$)" },
          { key: "shareA", label: "Fração A" },
          { key: "shareB", label: "Fração B" },
          { key: "effect", label: "Efeito no saldo" },
          { key: "balance", label: "Saldo (B deve a A)" },
        ],
        rows: lines.map((l) => ({
          date: formatDateBR(l.date),
          kind: l.kind === "despesa" ? "Despesa" : l.kind === "receita" ? "Receita" : "Reembolso",
          description: [l.categoryName, l.description].filter(Boolean).join(" — "),
          who: l.userName ?? "",
          party: l.party,
          amount: centsCell(l.amountCents),
          shareA: l.kind === "reembolso" ? "" : centsCell(l.shareA),
          shareB: l.kind === "reembolso" ? "" : centsCell(l.shareB),
          effect: centsCell(l.effect),
          balance: centsCell(l.balance),
        })),
        summary: [
          d.debtor ? `Saldo final: Parte ${d.debtor} deve ${formatCents(d.amountCents)} à Parte ${d.creditor}` : "Saldo final: contas acertadas",
          "Convenção: saldo positivo = Parte B deve à Parte A; negativo = Parte A deve à Parte B.",
        ],
      };
    }
    case "baixas": {
      const rows = (await listExits(db)).filter((e) => (!f.start || e.date >= f.start) && (!f.end || e.date <= f.end));
      return {
        title: "Baixas de animais",
        columns: [
          { key: "date", label: "Data" },
          { key: "type", label: "Tipo" },
          { key: "tag", label: "Brinco" },
          { key: "category", label: "Categoria" },
          { key: "age", label: "Idade" },
          { key: "cause", label: "Causa" },
          { key: "buyer", label: "Comprador" },
          { key: "weight", label: "Peso (kg)" },
          { key: "total", label: "Valor (R$)" },
        ],
        rows: rows.map((e) => ({
          date: formatDateBR(e.date),
          type: EXIT_LABEL[e.type],
          tag: e.tag,
          category: e.category ? CATEGORY_LABEL[e.category] : "",
          age: ageLabel(e.birthDate, e.date),
          cause: e.cause,
          buyer: e.buyer,
          weight: kg(e.weightG),
          total: centsCell(e.totalCents),
        })),
      };
    }
    case "partos": {
      const rows = (await listBirths(db)).filter((b) => (!f.start || b.date >= f.start) && (!f.end || b.date <= f.end));
      return {
        title: "Partos",
        columns: [
          { key: "date", label: "Data" },
          { key: "ewe", label: "Matriz" },
          { key: "ram", label: "Reprodutor" },
          { key: "alive", label: "Vivas" },
          { key: "dead", label: "Mortas" },
          { key: "type", label: "Tipo" },
          { key: "lambs", label: "Crias" },
        ],
        rows: rows.map((b) => ({ date: formatDateBR(b.date), ewe: b.eweTag, ram: b.ramTag, alive: b.bornAlive, dead: b.bornDead, type: b.birthType, lambs: b.lambs })),
      };
    }
    case "sanidade": {
      const rows = (await listHealthEvents(db, 5000)).filter((h) => (!f.start || h.date >= f.start) && (!f.end || h.date <= f.end));
      return {
        title: "Sanidade",
        columns: [
          { key: "date", label: "Data" },
          { key: "tag", label: "Brinco" },
          { key: "type", label: "Tipo" },
          { key: "product", label: "Produto" },
          { key: "dose", label: "Dose" },
          { key: "famacha", label: "FAMACHA" },
          { key: "withdrawal", label: "Carência até" },
          { key: "next", label: "Próxima dose" },
        ],
        rows: rows.map((h) => ({
          date: formatDateBR(h.date),
          tag: h.tag,
          type: HEALTH_LABEL[h.type],
          product: h.product,
          dose: h.dose,
          famacha: h.famacha,
          withdrawal: h.withdrawalUntil ? formatDateBR(h.withdrawalUntil) : "",
          next: h.nextDoseDate ? formatDateBR(h.nextDoseDate) : "",
        })),
      };
    }
    case "indicadores":
    case "matrizes": {
      const p = { ...defaultPeriod(), ...(f.start ? { start: f.start } : {}), ...(f.end ? { end: f.end } : {}) };
      const d = await dashboard(db, { ...p, lotId: f.lotId, party: f.party });
      if (kind === "matrizes") {
        return {
          title: "Ranking de matrizes",
          columns: [
            { key: "pos", label: "#" },
            { key: "tag", label: "Matriz" },
            { key: "births", label: "Partos" },
            { key: "born", label: "Crias nascidas" },
            { key: "weaned", label: "Desmamadas" },
            { key: "kg", label: "Kg desmamados" },
            { key: "iep", label: "IEP médio (dias)" },
            { key: "prol", label: "Prolificidade" },
          ],
          rows: d.ewes.ranking.map((s, i) => ({
            pos: i + 1,
            tag: s.tag,
            births: s.births,
            born: s.lambsBorn,
            weaned: s.lambsWeaned,
            kg: s.weanedKg.toFixed(1).replace(".", ","),
            iep: s.avgInterval ? Math.round(s.avgInterval) : "—",
            prol: s.prolificacy ? s.prolificacy.toFixed(2).replace(".", ",") : "—",
          })),
          summary: d.ewes.unproductive.map((u) => `Candidata a descarte ${u.tag}: ${u.reasons.join("; ")}`),
        };
      }
      const ind = [d.repro.natalidade, d.repro.paricao, d.repro.prolificidade, d.repro.partosMatrizAno, d.repro.iep, d.mortality.general, d.mortality.lambs, d.mortality.adult, d.weaning.taxa, d.weaning.peso];
      const fmt = (v: number | null, unit: string) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${unit}`);
      return {
        title: "Indicadores zootécnicos e financeiros",
        columns: [
          { key: "label", label: "Indicador" },
          { key: "value", label: "Valor" },
          { key: "calc", label: "Cálculo" },
          { key: "formula", label: "Fórmula" },
        ],
        rows: [
          ...ind.map((i) => ({ label: i.label, value: fmt(i.value, i.unit), calc: `${i.numerator} / ${i.denominator}`, formula: i.formula })),
          { label: "Despesas do período", value: formatCents(d.finance.expenseTotal), calc: "", formula: "Soma das despesas" },
          { label: "Receitas do período", value: formatCents(d.finance.revenueTotal), calc: "", formula: "Soma das receitas" },
          { label: "Resultado do período", value: formatCents(d.finance.result), calc: "", formula: "Receitas − despesas" },
          { label: "Resultado Parte A", value: formatCents(d.finance.totals.result.A), calc: "", formula: "Fração A das receitas − fração A das despesas" },
          { label: "Resultado Parte B", value: formatCents(d.finance.totals.result.B), calc: "", formula: "Fração B das receitas − fração B das despesas" },
          {
            label: "Custo por cabeça",
            value: d.finance.costPerHead.value === null ? "—" : formatCents(Math.round(d.finance.costPerHead.value)),
            calc: `${formatCents(d.finance.costPerHead.numerator)} / ${d.finance.costPerHead.denominator}`,
            formula: d.finance.costPerHead.formula,
          },
        ],
        summary: [
          `Período: ${formatDateBR(p.start)} a ${formatDateBR(p.end)}`,
          `Efetivo atual: ${d.herd.current.total} (${Object.entries(CATEGORY_LABEL).map(([k, v]) => `${v}: ${d.herd.current[k as keyof typeof d.herd.current]}`).join(", ")})`,
          d.finance.balanceDesc.debtor
            ? `Saldo atual: Parte ${d.finance.balanceDesc.debtor} deve ${formatCents(d.finance.balanceDesc.amountCents)} à Parte ${d.finance.balanceDesc.creditor}`
            : "Saldo atual: contas acertadas",
        ],
      };
    }
    default:
      throw new AppError("Relatório desconhecido", 404);
  }
}
