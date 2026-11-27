import Link from "next/link";
import { pageUserArea } from "@/server/page";
import { PageHeader } from "@/components/ui";
import { LogoutButton } from "../../(app)/mais/LogoutButton";

export const metadata = { title: "Perfumes · Mais" };

export default async function PerfumeMaisPage() {
  const user = await pageUserArea("perfumes");
  const items: [string, string, string][] = [
    ["/perfumes/vender", "🏷️", "Registrar venda"],
    ["/perfumes/repor", "📦", "Repor estoque (compra)"],
    ["/perfumes/produtos", "🧴", "Produtos e importação"],
    ["/perfumes/caixa", "💰", "Caixa (extrato e lucro)"],
    ["/perfumes/conta", "👤", "Minha conta e senha"],
  ];
  if (user.role === "admin") {
    items.push(["/", "🐑", "Ir para o módulo do Gado"]);
    items.push(["/admin", "⚙️", "Administração (criar logins, definir módulo)"]);
  }
  return (
    <div>
      <PageHeader title="Mais" subtitle={`${user.name} · Perfumes${user.role === "admin" ? " · Administrador" : ""}`} />
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
