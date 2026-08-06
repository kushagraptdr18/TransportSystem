import * as React from "react";
import { Info } from "lucide-react";

/**
 * Small ℹ️ that reveals its explanation on hover/focus — keeps cards clean
 * while the detail stays one pointer away. Pure CSS, works in server
 * components too.
 */
export function InfoHint({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`group/hint relative inline-flex ${className}`} tabIndex={0}>
      <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground/70 transition-colors group-hover/hint:text-primary" />
      <span
        className="pointer-events-none invisible absolute left-1/2 top-full z-50 mt-1.5 w-56 -translate-x-1/2 rounded-md border bg-popover p-2 text-left text-[11px] font-normal normal-case leading-snug text-popover-foreground opacity-0 shadow-md transition-opacity group-hover/hint:visible group-hover/hint:opacity-100 group-focus/hint:visible group-focus/hint:opacity-100"
      >
        {children}
      </span>
    </span>
  );
}
