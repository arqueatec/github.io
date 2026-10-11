import Link from "next/link";
import { getDb } from "@/db";
import { pageAdmin } from "@/server/page";
import { listCategories, listLots, listShareConfigs, listUsers } from "@/server/services/admin";
import { getSetting } from "@/server/services/inventory";
import { getLockedUntil } from "@/server/services/locks";
import { shareLabel } from "@/domain/ledger";
import { formatDateBR } from "@/domain/dates";
import { Badge, Card, PageHeader, Table } from "@/components/ui";
import { CategoryRow, LotRow, NewCategoryForm, NewLotForm, NewShareForm, NewUserForm, SettingsForm, UserRow } from "./AdminForms";
import { DeleteButton } from "@/components/forms";

export const metadata = { title: "Administração" };

export default async function AdminPage() {
  const me = await pageAdmin();
  const db = getDb();
  const [users, shares, cats, lots, target, lockedUntil] = await Promise.all([listUsers(db), listShareConfigs(db), listCategories(db), listLots(db), getSetting<number>(db, "inventory_target", 50), getLockedUntil(db)]);
  return (
    <div className="space-y-4">
      <PageHeader title="Administração" actions={<Link href="/admin/auditoria" className="btn btn-secondary">Auditoria</Link>} />

      <Card title="Usuários e partes">
        <p className="mb-2 text-xs text-[var(--muted)]">Financeiramente existem duas partes. A parte de cada lançamento é derivada do usuário que pagou/recebeu.</p>
        <Table head={["Nome", "E-mail", "Parte", "Perfil", "Ativo", ""]}>
          {users.map((u) => (
            <UserRow key={u.id} user={u} isMe={u.id === me.id} />
          ))}
        </Table>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-[var(--primary)]">+ Novo usuário</summary>
          <NewUserForm />
        </details>
      </Card>

      <Card title="Participação das partes (histórico de vigência)">
        <p className="mb-2 text-xs text-[var(--muted)]">
          Cada lançamento usa a participação vigente na sua data. Alterar não muda lançamentos anteriores à nova vigência.
          {lockedUntil && ` Vigências não podem começar até ${formatDateBR(lockedUntil)} (período fechado).`}
        </p>
        <Table head={["Vigente desde", "Parte A", "Parte B", "Obs.", ""]}>
          {shares.map((s) => {
            const l = shareLabel(s);
            return (
              <tr key={s.id}>
                <td>{formatDateBR(s.validFrom)}</td>
                <td>{l.A}</td>
                <td>{l.B}</td>
                <td className="text-xs">
                  {s.notes}
                  {s.createdByName && <div className="text-[var(--muted)]">por {s.createdByName}</div>}
                </td>
                <td>{shares.length > 1 && !(lockedUntil && s.validFrom <= lockedUntil) && <DeleteButton small url={`/api/admin/shares/${s.id}`} confirmText="Excluir esta vigência? Lançamentos passam a usar a vigência anterior." />}</td>
              </tr>
            );
          })}
        </Table>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-[var(--primary)]">+ Nova vigência</summary>
          <NewShareForm />
        </details>
      </Card>

      <Card title="Categorias financeiras">
        <div className="grid gap-4 sm:grid-cols-2">
          {(["despesa", "receita"] as const).map((k) => (
            <div key={k}>
              <h3 className="mb-2 text-sm font-semibold">{k === "despesa" ? "Despesas" : "Receitas"}</h3>
              <ul className="space-y-1">
                {cats
                  .filter((c) => c.kind === k)
                  .map((c) => (
                    <CategoryRow key={c.id} cat={c} />
                  ))}
              </ul>
              <NewCategoryForm kind={k} />
            </div>
          ))}
        </div>
      </Card>

      <Card title="Lotes / piquetes">
        <ul className="space-y-1">
          {lots.map((l) => (
            <LotRow key={l.id} lot={l} />
          ))}
        </ul>
        <NewLotForm />
      </Card>

      <Card title="Configurações">
        <SettingsForm target={target} />
      </Card>
      <p className="text-xs text-[var(--muted)]">
        Logado como <Badge>{me.name}</Badge>. Por regra, cada sócio — inclusive o administrador — só edita os próprios lançamentos financeiros.
      </p>
    </div>
  );
}
