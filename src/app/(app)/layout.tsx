import { pageUser } from "@/server/page";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await pageUser();
  return (
    <AppShell user={{ name: user.name, role: user.role, party: user.party }}>
      {children}
    </AppShell>
  );
}
