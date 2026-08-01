import Link from "next/link";
import { cn } from "@/lib/utils";

export interface TabDef {
  /** value written to the `tab` search param */
  value: string;
  label: string;
  /** optional count shown as a muted pill after the label */
  count?: number;
}

/**
 * Underline tab row driven by a search param, not client state — each tab is a
 * plain link, so the server renders only the active tab's data and the tab
 * survives a refresh or a shared URL.
 *
 * The href deliberately carries ONLY the tab: filter keys such as `driver`,
 * `status` and `date_from` are reused across tabs with different meanings, so
 * carrying them over would silently filter the next tab down to nothing.
 */
export function TabNav({
  tabs,
  active,
  basePath,
  className,
}: {
  tabs: TabDef[];
  active: string;
  basePath: string;
  className?: string;
}) {
  return (
    <div className={cn("border-b", className)} role="tablist">
      <div className="-mb-px flex flex-wrap gap-1">
        {tabs.map((t) => {
          const selected = t.value === active;
          return (
            <Link
              key={t.value}
              href={`${basePath}?tab=${t.value}`}
              role="tab"
              aria-selected={selected}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
                selected
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
              )}
            >
              {t.label}
              {t.count != null && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                  {t.count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
