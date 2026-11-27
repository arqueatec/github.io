import { pageUserArea } from "@/server/page";
import { PerfumeShell } from "@/components/PerfumeShell";

export const dynamic = "force-dynamic";

export default async function PerfumesLayout({ children }: { children: React.ReactNode }) {
  const user = await pageUserArea("perfumes");
  return <PerfumeShell user={{ name: user.name, role: user.role }}>{children}</PerfumeShell>;
}
