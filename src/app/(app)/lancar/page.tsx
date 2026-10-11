import Link from "next/link";
import { PageHeader } from "@/components/ui";

const GROUPS: { title: string; items: [string, string, string][] }[] = [
  {
    title: "Rebanho",
    items: [
      ["/inventario", "📝", "Inventário rápido"],
      ["/animais/novo", "🐑", "Cadastrar animal"],
      ["/inventario/recontagem", "🔢", "Recontagem"],
    ],
  },
  {
    title: "Reprodução",
    items: [
      ["/reproducao/cobertura", "❤️", "Cobertura"],
      ["/reproducao/diagnostico", "🔍", "Diagnóstico"],
      ["/reproducao/parto", "🍼", "Parto"],
      ["/reproducao/desmame", "🌱", "Desmame"],
    ],
  },
  {
    title: "Sanidade e manejo",
    items: [
      ["/sanidade/novo", "💉", "Vacina / vermífugo / tratamento"],
      ["/sanidade/pesagem", "⚖️", "Pesagem / escore"],
    ],
  },
  {
    title: "Baixas",
    items: [
      ["/baixas/venda", "🤝", "Venda"],
      ["/baixas/nova", "⚰️", "Morte / abate / consumo"],
    ],
  },
  {
    title: "Finanças",
    items: [
      ["/financeiro/despesas/nova", "🧾", "Despesa"],
      ["/financeiro/receitas/nova", "💵", "Receita"],
      ["/financeiro/reembolsos/novo", "🔁", "Reembolso"],
    ],
  },
];

export default function LancarPage() {
  return (
    <div>
      <PageHeader title="Lançar" subtitle="Formulários rápidos — funcionam sem sinal e enviam depois." />
      <div className="space-y-5">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="mb-2 text-sm font-semibold text-[var(--muted)]">{g.title}</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {g.items.map(([href, icon, label]) => (
                <Link key={href} href={href} className="tile">
                  <span className="text-2xl" aria-hidden>
                    {icon}
                  </span>
                  {label}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
