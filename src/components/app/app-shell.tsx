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
      {/* the safe-area insets go on the wrapper so they add to the padding
          utilities below instead of overriding them at md and up */}
      <div
        className="flex min-w-0 flex-1 flex-col"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        <main className="mx-auto w-full min-w-0 max-w-[1400px] flex-1 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
