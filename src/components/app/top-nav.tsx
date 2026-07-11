"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  ChevronDown,
  LogOut,
  Menu,
  Search,
  Truck,
  User,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { NAV, type NavGroup } from "@/components/app/nav-config";

export interface TopNavProps {
  firmName: string;
  fyLabel: string;
  userName: string;
  role: string;
}

function isGroupActive(group: NavGroup, pathname: string): boolean {
  if (group.href) return pathname === group.href || pathname.startsWith(group.href + "/");
  return group.items?.some((i) => pathname === i.href || pathname.startsWith(i.href + "/")) ?? false;
}

/** Desktop menu bar: one dropdown per module group. */
function DesktopMenu({ pathname }: { pathname: string }) {
  return (
    <nav className="no-print hidden items-center gap-0.5 overflow-x-auto px-2 lg:flex">
      {NAV.map((group) => {
        const active = isGroupActive(group, pathname);
        if (group.href) {
          return (
            <Link
              key={group.label}
              href={group.href}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <group.icon className="h-4 w-4" />
              {group.label}
            </Link>
          );
        }
        return (
          <DropdownMenu key={group.label}>
            <DropdownMenuTrigger
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors",
                active
                  ? "bg-primary/15 text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
                "data-[state=open]:bg-accent data-[state=open]:text-foreground"
              )}
            >
              <group.icon className={cn("h-4 w-4", active && "text-primary")} />
              {group.label}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {group.items!.map((item) => (
                <DropdownMenuItem key={item.href + item.label} asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      "w-full cursor-pointer",
                      pathname === item.href && "bg-primary/10 font-medium"
                    )}
                  >
                    {item.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </nav>
  );
}

/** Mobile: full-screen slide-down panel with accordion groups. */
function MobileMenu({
  pathname,
  onClose,
}: {
  pathname: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background lg:hidden">
      <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <Brand />
        <button type="button" onClick={onClose} aria-label="Close menu" className="p-2">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {NAV.map((group) =>
          group.href ? (
            <Link
              key={group.label}
              href={group.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium",
                isGroupActive(group, pathname)
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent"
              )}
            >
              <group.icon className="h-4 w-4" />
              {group.label}
            </Link>
          ) : (
            <details key={group.label} open={isGroupActive(group, pathname)} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-accent [&::-webkit-details-marker]:hidden">
                <group.icon className="h-4 w-4 text-primary" />
                <span className="flex-1">{group.label}</span>
                <ChevronDown className="h-4 w-4 opacity-60 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mb-1 ml-5 space-y-0.5 border-l-2 border-primary/30 pl-3">
                {group.items!.map((item) => (
                  <Link
                    key={item.href + item.label}
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "block rounded-md px-3 py-2 text-sm",
                      pathname === item.href
                        ? "bg-primary/15 font-medium text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </details>
          )
        )}
      </div>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-sm">
        <Truck className="h-5 w-5 text-primary-foreground" />
      </span>
      <span className="text-[17px] font-bold tracking-tight">
        Transport<span className="text-primary">TMS</span>
      </span>
    </Link>
  );
}

export function TopNav({ firmName, fyLabel, userName, role }: TopNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <header className="no-print sticky top-0 z-40 border-b bg-card/95 shadow-card backdrop-blur supports-[backdrop-filter]:bg-card/80">
      {/* Row 1 — brand, firm, search, user */}
      <div className="flex h-14 items-center gap-3 px-4">
        <button
          type="button"
          className="p-1.5 lg:hidden"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <Brand />

        <Link
          href="/select-firm"
          className="ml-2 hidden min-w-0 items-center gap-2 rounded-full border bg-background px-3 py-1.5 hover:border-primary/50 hover:bg-accent sm:flex"
          title="Switch firm / financial year"
        >
          <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="max-w-[180px] truncate text-xs font-semibold">{firmName}</span>
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            FY {fyLabel}
          </Badge>
        </Link>

        <form
          className="ml-auto hidden w-full max-w-xs items-center md:flex"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) router.push(`/lr/register?q=${encodeURIComponent(q.trim())}`);
          }}
        >
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search LR number..."
              className="h-9 rounded-full border-muted bg-background pl-9"
            />
          </div>
        </form>

        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 rounded-full pl-1.5"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-foreground">
                {userName
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase()}
              </span>
              <span className="hidden max-w-[100px] truncate text-xs sm:inline">{userName}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>
              <div className="text-sm font-medium">{userName}</div>
              <div className="text-xs font-normal text-muted-foreground">{role}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/select-firm">
                <Building2 className="h-4 w-4" />
                Switch Firm / FY
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <form action="/logout" method="POST" className="w-full">
                <button type="submit" className="flex w-full items-center gap-2">
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="hidden">
          <User className="h-4 w-4" />
        </span>
      </div>

      {/* Row 2 — module menu bar (desktop) */}
      <div className="hidden border-t lg:block">
        <DesktopMenu pathname={pathname} />
      </div>

      {mobileOpen && <MobileMenu pathname={pathname} onClose={() => setMobileOpen(false)} />}
    </header>
  );
}
