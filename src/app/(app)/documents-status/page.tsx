import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { DocStatusClient, type DocStatusRow } from "./doc-status-client";

export const dynamic = "force-dynamic";

/**
 * Document Registration Status — a standalone monitoring screen (like the
 * E-Way board). Every registration with its renewal status; bulk update and a
 * per-row Edit popup carrying the registration's basic details.
 */
export default async function DocumentsStatusPage() {
  const session = requireSession();
  await authorize(session, "masters", "view");

  const { rows, docTypes, vehicles } = await withTenant(session.tenantId, async (tx) => {
    const [allDocs, docTypes, vehicles] = await Promise.all([
      tx.vehicleDocument.findMany({ include: { docType: true }, orderBy: { expiryDate: "asc" } }),
      tx.documentType.findMany({ orderBy: { name: "asc" } }),
      tx.vehicle.findMany({ where: { isActive: true }, orderBy: { number: "asc" } }),
    ]);
    // Reminder rule: a document appears here only while its expiry falls
    // within its type's reminderDays window (or is already past). Renew it —
    // push the expiry out — and it disappears on the next load.
    const now = new Date();
    const docs = allDocs.filter((d) => {
      if (!d.expiryDate || !d.docType.showReminder) return false;
      const windowEnd = new Date(now);
      windowEnd.setDate(windowEnd.getDate() + (d.docType.reminderDays ?? 30));
      return d.expiryDate <= windowEnd;
    });
    // first appearance on the board = renewal work starts: DONE flips to
    // PENDING automatically — but ONLY when the DONE mark predates the
    // document's entry into its reminder window. A user who deliberately
    // marks DONE while the document is already on the board (updatedAt is
    // inside the window) is respected, so the flip can never loop.
    const windowEntry = (d: (typeof docs)[number]) => {
      const w = new Date(d.expiryDate as Date);
      w.setDate(w.getDate() - (d.docType.reminderDays ?? 30));
      return w;
    };
    const toPending = docs
      .filter((d) => d.status === "DONE" && d.updatedAt < windowEntry(d))
      .map((d) => d.id);
    if (toPending.length) {
      await tx.vehicleDocument.updateMany({
        where: { id: { in: toPending } },
        data: { status: "PENDING" },
      });
      docs.forEach((d) => {
        if (toPending.includes(d.id)) d.status = "PENDING";
      });
    }
    return { docs, docTypes, vehicles };
  }).then(({ docs, docTypes, vehicles }) => {
    const vname = new Map(vehicles.map((v) => [v.id, v.number]));
    const now = new Date();
    const rows: DocStatusRow[] = docs.map((d) => ({
      id: d.id,
      docTypeId: d.docTypeId,
      docTypeName: d.docType.name,
      vehicleId: d.vehicleId,
      vehicleNumber: vname.get(d.vehicleId) ?? "",
      docNo: d.docNo ?? "",
      companyName: d.companyName ?? "",
      entryDate: formatDate(d.entryDate),
      effectiveDate: d.effectiveDate ? formatDate(d.effectiveDate) : "",
      expiryDate: d.expiryDate ? formatDate(d.expiryDate) : "",
      expiredNow: !!d.expiryDate && d.expiryDate < now,
      status: d.status,
      remarks: d.remarks ?? "",
      filePath: d.filePath,
      fileName: d.fileName,
    }));
    return { rows, docTypes, vehicles };
  });

  return (
    <DocStatusClient
      rows={rows}
      docTypeOptions={docTypes.map((d) => ({ value: d.id, label: d.name }))}
      vehicleOptions={vehicles.map((v) => ({ value: v.id, label: v.number }))}
    />
  );
}
