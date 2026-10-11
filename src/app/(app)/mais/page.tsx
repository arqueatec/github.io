import Link from "next/link";
import { pageUser } from "@/server/page";
import { PageHeader } from "@/components/ui";
import { LogoutButton } from "./LogoutButton";

export default async function MaisPage() {
  const user = await pageUser();
  const items: [string, string, string][] = [
    ["/indicadores", "📊", "Indicadores zootécnicos e financeiros"],
    ["/reproducao", "❤️", "Reprodução (coberturas, partos, previsões)"],
    ["/sanidade", "💉", "Sanidade e pesagens"],
    ["/baixas", "📤", "Baixas (vendas, mortes, abates)"],
    ["/inventario", "📝", "Inventário e recontagens"],
    ["/relatorios", "📄", "Relatórios (CSV/PDF) e importação"],
    ["/financeiro/fechamentos", "🔒", "Fechamentos de período"],
    ["/conta", "👤", "Minha conta e senha"],
  ];
  if (user.role === "admin") {
    items.push(["/admin", "⚙️", "Administração (usuários, percentuais, categorias, lotes)"]);
    items.push(["/admin/auditoria", "🕵️", "Auditoria"]);
  }
  return (
    <div>
      <PageHeader title="Mais" subtitle={`${user.name} · Parte ${user.party} · ${user.role === "admin" ? "Administrador" : "Sócio"}`} />
      <ul className="card divide-y divide-[var(--border)] p-0">
        {items.map(([href, icon, label]) => (
          <li key={href}>
            <Link href={href} className="flex min-h-14 items-center gap-3 px-4">
              <span className="text-xl" aria-hidden>
                {icon}
              </span>
              <span className="font-medium">{label}</span>
              <span className="ml-auto text-[var(--muted)]">›</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <LogoutButton />
      </div>
    </div>
  );
}
