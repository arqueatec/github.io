import { pageUser } from "@/server/page";
import { Card, PageHeader } from "@/components/ui";
import { PasswordForm } from "./PasswordForm";

export default async function ContaPage() {
  const user = await pageUser();
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title="Minha conta" back="/mais" />
      <Card>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-[var(--muted)]">Nome</dt>
          <dd>{user.name}</dd>
          <dt className="text-[var(--muted)]">E-mail</dt>
          <dd>{user.email}</dd>
          <dt className="text-[var(--muted)]">Parte</dt>
          <dd>Parte {user.party}</dd>
          <dt className="text-[var(--muted)]">Perfil</dt>
          <dd>{user.role === "admin" ? "Administrador" : "Sócio"}</dd>
        </dl>
      </Card>
      <Card title="Trocar senha">
        <PasswordForm />
      </Card>
    </div>
  );
}
