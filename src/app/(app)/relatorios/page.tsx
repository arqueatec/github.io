import { pageUser } from "@/server/page";
import { REPORT_KINDS } from "@/server/services/reports";
import { Card, PageHeader } from "@/components/ui";
import { ExportPicker, ImportSheet } from "./ReportsClient";

export const metadata = { title: "Relatórios" };

export default async function RelatoriosPage() {
  await pageUser();
  return (
    <div className="space-y-4">
      <PageHeader title="Relatórios e importação" />
      <Card title="Exportar">
        <ExportPicker kinds={Object.entries(REPORT_KINDS).map(([value, label]) => ({ value, label }))} />
      </Card>
      <Card title="Importar rebanho por planilha">
        <p className="mb-3 text-sm text-[var(--muted)]">
          Aceita CSV (separado por ; ou ,) ou Excel .xlsx com cabeçalho. Colunas reconhecidas: <b>brinco</b>, <b>sexo</b> (M/F), <b>categoria</b>, raca, nascimento (dd/mm/aaaa), idade_meses, mae, pai, lote, entrada, observacoes.
          A importação valida tudo antes e grava tudo ou nada. Lotes inexistentes são criados.
        </p>
        <ImportSheet />
      </Card>
    </div>
  );
}
