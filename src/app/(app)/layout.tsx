import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { AppShell } from "@/components/app/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (!session) redirect("/login");
  if (!session.firmId || !session.fyId) redirect("/select-firm");

  // isActive is only checked at login, but a JWT lives 12h — re-validate per
  // request so a deactivated user loses access immediately, not at expiry
  const active = await withTenant(session.tenantId, (tx) =>
    tx.user.findFirst({
      where: { id: session.userId, isActive: true },
      select: { id: true },
    })
  );
  if (!active) redirect("/login");

  return <AppShell session={session}>{children}</AppShell>;
}
