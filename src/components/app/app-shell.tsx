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
      {/*
        The safe-area insets go on this wrapper so they add to the padding
        utilities below instead of overriding them at md and up.

        overflow-x-clip is a backstop, not the fix: if one stray element is
        wider than the viewport, the page would otherwise scroll sideways and
        the header - sized to the viewport - would stop short of the content,
        leaving a strip of background down the right. Clip keeps the y axis
        visible, unlike hidden/auto, so sticky positioning and popovers still
        work.
      */}
      <div
        className="flex min-w-0 flex-1 flex-col overflow-x-clip"
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
