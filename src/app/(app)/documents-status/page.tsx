import { requireSession } from "@/lib/session";
import { syncDocumentStatuses } from "@/lib/document-status";
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
    // shared flip: entering the reminder window turns DONE into PENDING —
    // the dashboard and documents register run the same sync
    await syncDocumentStatuses(tx);
    const [allDocs, docTypes, vehicles] = await Promise.all([
      tx.vehicleDocument.findMany({ include: { docType: true }, orderBy: { expiryDate: "asc" } }),
      tx.documentType.findMany({ orderBy: { name: "asc" } }),
      // ALL vehicles — an inactive vehicle's document row must still show its
      // number (and stay searchable); pickers can filter client-side
      tx.vehicle.findMany({ orderBy: { number: "asc" } }),
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
