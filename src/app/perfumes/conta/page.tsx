import { pageUserArea } from "@/server/page";
import { Card, PageHeader } from "@/components/ui";
import { PasswordForm } from "../../(app)/conta/PasswordForm";

export const metadata = { title: "Minha conta" };

export default async function PerfumeContaPage() {
  const user = await pageUserArea("perfumes");
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title="Minha conta" back="/perfumes/mais" />
      <Card>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-[var(--muted)]">Nome</dt>
          <dd>{user.name}</dd>
          <dt className="text-[var(--muted)]">E-mail</dt>
          <dd>{user.email}</dd>
          <dt className="text-[var(--muted)]">Módulo</dt>
          <dd>Perfumes</dd>
        </dl>
      </Card>
      <Card title="Trocar senha">
        <PasswordForm />
      </Card>
    </div>
  );
}
