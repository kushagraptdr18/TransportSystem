import Link from "next/link";
import { cn } from "@/lib/utils";

export interface TabDef {
  /** value written to the `tab` search param, or passed to onSelect */
  value: string;
  label: string;
  /** optional leading icon */
  icon?: React.ReactNode;
  /** optional count shown as a muted pill after the label */
  count?: number;
}

const tabClass = (selected: boolean) =>
  cn(
    "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
    selected
      ? "border-primary font-medium text-foreground"
      : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
  );

/**
 * Underline tab row, in one of two modes:
 *
 *  - `basePath` — each tab is a link writing a `tab` search param, so the
 *    server renders only the active tab and the choice survives a refresh or a
 *    shared URL. The href carries ONLY the tab: filter keys such as `driver`,
 *    `status` and `date_from` are reused across tabs with different meanings,
 *    so carrying them over would silently filter the next tab down to nothing.
 *
 *  - `onSelect` — buttons driven by client state, for tabs that switch a live
 *    form rather than a page (a URL change there would remount and lose
 *    whatever the user had typed).
 */
export function TabNav({
  tabs,
  active,
  basePath,
  onSelect,
  className,
}: {
  tabs: TabDef[];
  active: string;
  basePath?: string;
  onSelect?: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("border-b", className)} role="tablist">
      <div className="-mb-px flex flex-wrap gap-1">
        {tabs.map((t) => {
          const selected = t.value === active;
          const inner = (
            <>
              {t.icon}
              {t.label}
              {t.count != null && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                  {t.count}
                </span>
              )}
            </>
          );
          return basePath ? (
            <Link
              key={t.value}
              href={`${basePath}?tab=${t.value}`}
              role="tab"
              aria-selected={selected}
              className={tabClass(selected)}
            >
              {inner}
            </Link>
          ) : (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onSelect?.(t.value)}
              className={tabClass(selected)}
            >
              {inner}
            </button>
          );
        })}
      </div>
    </div>
  );
}
