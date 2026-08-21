import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isUserActive } from "@/lib/cached-auth";
import { AppShell } from "@/components/app/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (!session) redirect("/login");
  if (!session.firmId || !session.fyId) redirect("/select-firm");

  // isActive is only checked at login, but a JWT lives 12h — re-validate so a
  // deactivated user loses access quickly, not at expiry. Cached (60s TTL +
  // tag revalidated by the users screen) so it doesn't cost a DB transaction
  // on every single navigation.
  const active = await isUserActive(session.tenantId, session.userId);
  if (!active) redirect("/login");

  return <AppShell session={session}>{children}</AppShell>;
}
