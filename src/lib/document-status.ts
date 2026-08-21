import type { Tx } from "@/lib/db";

/**
 * Auto-flip vehicle documents DONE → PENDING the moment they enter their
 * type's reminder window (expiry − reminderDays), so renewal work surfaces
 * everywhere at once — dashboard, status board and the documents register.
 *
 * DONE cannot survive inside the window AT ALL: a real renewal enters a NEW
 * expiry date, which moves the document out of the window and lets DONE
 * stick. Marking DONE without a new expiry means the work is still pending —
 * so it flips right back. (PROCESSING / PROBLEM are never touched.)
 */
export async function syncDocumentStatuses(tx: Tx): Promise<void> {
  // bound the scan to documents that can possibly be inside a window: the
  // widest window is max(reminderDays) across types, so anything expiring
  // later than now + that many days can never flip
  const types = await tx.documentType.findMany({
    where: { showReminder: true },
    select: { id: true, reminderDays: true },
  });
  if (!types.length) return;
  const maxDays = Math.max(...types.map((t) => t.reminderDays ?? 30));
  const now = new Date();
  const maxWindowEnd = new Date(now);
  maxWindowEnd.setDate(maxWindowEnd.getDate() + maxDays);

  const docs = await tx.vehicleDocument.findMany({
    where: {
      status: "DONE",
      expiryDate: { not: null, lte: maxWindowEnd },
      docTypeId: { in: types.map((t) => t.id) },
    },
    select: { id: true, docTypeId: true, expiryDate: true },
  });
  const daysByType = new Map(types.map((t) => [t.id, t.reminderDays ?? 30]));
  const toPending = docs
    .filter((d) => {
      if (!d.expiryDate) return false;
      const windowEnd = new Date(now);
      windowEnd.setDate(windowEnd.getDate() + (daysByType.get(d.docTypeId) ?? 30));
      return d.expiryDate <= windowEnd; // inside the window (or already expired)
    })
    .map((d) => d.id);
  if (toPending.length) {
    await tx.vehicleDocument.updateMany({
      where: { id: { in: toPending } },
      data: { status: "PENDING" },
    });
  }
}

// The dashboard used to run the sync on every view. Flips only matter at
// day granularity (windows move at midnight), so once per interval per
// tenant per server instance is plenty; the status board still syncs
// unconditionally on its own page.
const lastSyncAt = new Map<string, number>();
const SYNC_INTERVAL_MS = 10 * 60 * 1000;

export async function syncDocumentStatusesThrottled(tx: Tx, tenantId: string): Promise<void> {
  const last = lastSyncAt.get(tenantId) ?? 0;
  if (Date.now() - last < SYNC_INTERVAL_MS) return;
  lastSyncAt.set(tenantId, Date.now());
  await syncDocumentStatuses(tx);
}
