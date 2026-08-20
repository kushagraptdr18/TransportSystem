import type { Tx } from "@/lib/db";

/**
 * Auto-flip vehicle documents DONE → PENDING the moment they enter their
 * type's reminder window (expiry − reminderDays), so renewal work surfaces
 * everywhere at once — dashboard, status board and the documents register.
 *
 * Guard: only a DONE mark that PREDATES the window entry flips. A user who
 * deliberately marks DONE while the document is already inside the window
 * (updatedAt within it) is respected, so the flip can never loop.
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
      return d.updatedAt < windowEntry;
    })
    .map((d) => d.id);
  if (toPending.length) {
    await tx.vehicleDocument.updateMany({
      where: { id: { in: toPending } },
      data: { status: "PENDING" },
    });
  }
}
