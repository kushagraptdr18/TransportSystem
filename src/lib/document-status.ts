import type { Tx } from "@/lib/db";

/**
 * Auto-flip vehicle documents DONE → PENDING the moment they enter their
 * type's reminder window (expiry − reminderDays), so renewal work surfaces
 * everywhere at once — dashboard, status board and the documents register.
 *
 * Guard: only an EXPLICIT status action (status board / bulk update) stamps
 * statusSetAt. A DONE deliberately marked while the document is inside the
 * window is respected (no flip loop); a document merely created or edited
 * flips normally — updatedAt is NOT trusted, it moves on every edit.
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
      if (d.expiryDate > windowEnd) return false; // not in the window yet
      const windowEntry = new Date(d.expiryDate);
      windowEntry.setDate(windowEntry.getDate() - reminderDays);
      return !d.statusSetAt || d.statusSetAt < windowEntry;
    })
    .map((d) => d.id);
  if (toPending.length) {
    await tx.vehicleDocument.updateMany({
      where: { id: { in: toPending } },
      data: { status: "PENDING" },
    });
  }
}
