import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/app/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (!session) redirect("/login");
  if (!session.firmId || !session.fyId) redirect("/select-firm");

  return <AppShell session={session}>{children}</AppShell>;
}
