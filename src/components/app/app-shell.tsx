import { TopNav } from "@/components/app/top-nav";
import type { Session } from "@/lib/session";

export function AppShell({
  session,
  children,
}: {
  session: Session;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav
        firmName={session.firmName ?? ""}
        fyLabel={session.fyLabel ?? ""}
        userName={session.name}
        role={session.role}
      />
      <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
