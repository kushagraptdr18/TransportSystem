"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { authorize } from "@/lib/authz";
import { audit } from "@/lib/audit";

/**
 * E-Way Bill monitoring actions. Dates are handled as CALENDAR dates
 * (yyyy-mm-dd): stored timestamps sit at the saving machine's midnight, so the
 * +12h trick recovers the intended calendar day regardless of timezone.
 */

const REVALIDATE = "/eway";

const calDate = (d: Date): string =>
  new Date(d.getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10);

/** Mark an LR's e-way bill as verified (or clear the mark with checked=false). */
export async function setEwayChecked(
  lrId: string,
  checked: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  await authorize(session, "lr", "edit");
  try {
    await withTenant(session.tenantId, async (tx) => {
      const lr = await tx.lr.findFirst({
        where: { id: lrId, firmId: session.firmId, fyId: session.fyId, deletedAt: null },
      });
      if (!lr) throw new Error("LR not found");
      await tx.ewayMonitor.upsert({
        where: { lrId },
        create: {
          tenantId: session.tenantId,
          firmId: session.firmId,
          fyId: session.fyId,
          lrId,
          checkedAt: checked ? new Date() : null,
          checkedById: checked ? session.userId : null,
          checkedBy: checked ? session.name : null,
        },
        update: {
          checkedAt: checked ? new Date() : null,
          checkedById: checked ? session.userId : null,
          checkedBy: checked ? session.name : null,
        },
      });
    });
    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

/** Extend / correct the e-way expiry. The old date goes into the history so
 *  the old tab reads "Extended Till <new>"; the check mark resets because the
 *  renewed bill needs a fresh verification. */
export async function extendEway(
  lrId: string,
  newExpiry: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  await authorize(session, "lr", "edit");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newExpiry)) {
    return { ok: false, error: "Valid expiry date is required" };
  }
  try {
    await withTenant(session.tenantId, async (tx) => {
      const lr = await tx.lr.findFirst({
        where: { id: lrId, firmId: session.firmId, fyId: session.fyId, deletedAt: null },
      });
      if (!lr) throw new Error("LR not found");
      const oldCal = lr.ewayExpiry ? calDate(lr.ewayExpiry) : null;
      const monitor = await tx.ewayMonitor.findUnique({ where: { lrId } });
      const prev: string[] = Array.isArray(monitor?.prevExpiries)
        ? (monitor?.prevExpiries as string[])
        : [];
      if (oldCal && oldCal !== newExpiry && !prev.includes(oldCal)) prev.push(oldCal);

      await tx.lr.update({
        where: { id: lrId },
        data: { ewayExpiry: new Date(`${newExpiry}T00:00:00`) },
      });
      await tx.ewayMonitor.upsert({
        where: { lrId },
        create: {
          tenantId: session.tenantId,
          firmId: session.firmId,
          fyId: session.fyId,
          lrId,
          prevExpiries: prev,
          checkedAt: null,
        },
        update: { prevExpiries: prev, checkedAt: null, checkedById: null, checkedBy: null },
      });
      await audit(tx, session, {
        entity: "Lr",
        entityId: lrId,
        action: "UPDATE",
        after: { ewayExpiry: newExpiry, extendedFrom: oldCal },
      });
    });
    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}
