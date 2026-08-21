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
  const docs = await tx.vehicleDocument.findMany({
    where: { expiryDate: { not: null }, status: "DONE" },
    include: { docType: true },
  });
  const now = new Date();
  const toPending = docs
    .filter((d) => {
      if (!d.docType.showReminder || !d.expiryDate) return false;
      const reminderDays = d.docType.reminderDays ?? 30;
      const windowEnd = new Date(now);
      windowEnd.setDate(windowEnd.getDate() + reminderDays);
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
