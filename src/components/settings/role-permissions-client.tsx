"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import {
  ACTIONS,
  EDITABLE_ROLES,
  MODULES,
  ROLE_DEFAULTS,
  type Action,
  type RoleKey,
} from "@/lib/permissions";
import {
  saveRolePermissions,
  resetRolePermissions,
} from "@/app/(app)/settings/permissions/actions";

export interface SavedRoleRow {
  role: string;
  module: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canPrint: boolean;
  canExport: boolean;
}

type Matrix = Record<string, Record<Action, boolean>>;

const FLAG_OF: Record<Action, keyof Omit<SavedRoleRow, "role" | "module">> = {
  view: "canView",
  create: "canCreate",
  edit: "canEdit",
  delete: "canDelete",
  print: "canPrint",
  export: "canExport",
};

/** matrix for one role: saved rows where present, role defaults elsewhere */
function buildMatrix(role: RoleKey, saved: SavedRoleRow[]): Matrix {
  const byModule = new Map(
    saved.filter((r) => r.role === role).map((r) => [r.module, r])
  );
  const out: Matrix = {};
  for (const m of MODULES) {
    const row = byModule.get(m.key);
    out[m.key] = Object.fromEntries(
      ACTIONS.map(({ key }) => [
        key,
        row ? row[FLAG_OF[key]] : ROLE_DEFAULTS[role].includes(key),
      ])
    ) as Record<Action, boolean>;
  }
  return out;
}

export function RolePermissionsClient({ saved }: { saved: SavedRoleRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [role, setRole] = React.useState<RoleKey>("OPERATOR");
  const [matrix, setMatrix] = React.useState<Matrix>(() => buildMatrix("OPERATOR", saved));
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const pickRole = (r: RoleKey) => {
    if (dirty && !confirm("Discard unsaved changes for this role?")) return;
    setRole(r);
    setMatrix(buildMatrix(r, saved));
    setDirty(false);
  };

  // an Admin can never lock Admins out of this screen
  const isLocked = (moduleKey: string) => role === "ADMIN" && moduleKey === "settings";

  const setCell = (moduleKey: string, action: Action, value: boolean) => {
    if (isLocked(moduleKey)) return;
    setMatrix((prev) => ({
      ...prev,
      [moduleKey]: { ...prev[moduleKey], [action]: value },
    }));
    setDirty(true);
  };

  const setModuleAll = (moduleKey: string, value: boolean) => {
    if (isLocked(moduleKey)) return;
    setMatrix((prev) => ({
      ...prev,
      [moduleKey]: Object.fromEntries(ACTIONS.map((a) => [a.key, value])) as Record<
        Action,
        boolean
      >,
    }));
    setDirty(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await saveRolePermissions({
        role,
        rows: MODULES.map((m) => ({
          module: m.key,
          canView: matrix[m.key].view,
          canCreate: matrix[m.key].create,
          canEdit: matrix[m.key].edit,
          canDelete: matrix[m.key].delete,
          canPrint: matrix[m.key].print,
          canExport: matrix[m.key].export,
        })),
      });
      if (res.ok) {
        toast({
          title: `Permissions saved for ${role}`,
          description: "Users with this role see the change on their next action.",
        });
        setDirty(false);
        router.refresh();
      } else toast({ variant: "destructive", title: "Save failed", description: res.error });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!confirm(`Reset ${role} to the built-in defaults? Saved customisations are removed.`))
      return;
    setBusy(true);
    try {
      const res = await resetRolePermissions(role);
      if (res.ok) {
        toast({ title: `${role} reset to defaults` });
        setMatrix(buildMatrix(role, []));
        setDirty(false);
        router.refresh();
      } else toast({ variant: "destructive", title: "Reset failed", description: res.error });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Role Permissions</h1>
          <p className="text-sm text-muted-foreground">
            What each role may do, module by module. OWNER always has full access and cannot
            be edited; a user-specific override from the database still wins over the role.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="w-44">
            <Select value={role} onValueChange={(v) => pickRole(v as RoleKey)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EDITABLE_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={reset} disabled={busy}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
          </Button>
          <Button onClick={save} disabled={busy || !dirty}>
            {busy ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{role} — module access</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Module</TableHead>
                  {ACTIONS.map((a) => (
                    <TableHead key={a.key} className="w-20 text-center">
                      {a.label}
                    </TableHead>
                  ))}
                  <TableHead className="w-24 text-center">All</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MODULES.map((m) => {
                  const locked = isLocked(m.key);
                  const all = ACTIONS.every((a) => matrix[m.key][a.key]);
                  return (
                    <TableRow key={m.key}>
                      <TableCell className="font-medium">
                        {m.label}
                        {locked && (
                          <span className="ml-2 text-[11px] text-muted-foreground">
                            always full for ADMIN
                          </span>
                        )}
                      </TableCell>
                      {ACTIONS.map((a) => (
                        <TableCell key={a.key} className="text-center">
                          <Checkbox
                            checked={matrix[m.key][a.key]}
                            disabled={locked || busy}
                            onCheckedChange={(c) => setCell(m.key, a.key, !!c)}
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-center">
                        <Checkbox
                          checked={all}
                          disabled={locked || busy}
                          onCheckedChange={(c) => setModuleAll(m.key, !!c)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {dirty && (
            <p className="mt-2 text-xs font-medium text-primary">
              Unsaved changes — click Save to apply them to every {role} user.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
