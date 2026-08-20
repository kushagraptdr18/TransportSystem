import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { syncDocumentStatuses } from "@/lib/document-status";
import { formatDate } from "@/lib/utils";
import { VehicleDocumentsClient } from "@/components/masters/vehicle-documents-client";

export const dynamic = "force-dynamic";

export async function DocumentRegistrationTab({
  searchParams,
}: {
  searchParams: { vehicle?: string; docType?: string; due?: string; status?: string };
}) {
  const session = requireSession();
  await authorize(session, "masters", "view");
  const today = new Date();

  const { rows, docTypes, vehicles } = await withTenant(session.tenantId, async (tx) => {
    // entering the reminder window flips DONE → PENDING here too, so the
    // register never shows a stale DONE (same sync as dashboard/status board)
    await syncDocumentStatuses(tx);
    const where: Prisma.VehicleDocumentWhereInput = {};
    if (searchParams.vehicle) where.vehicleId = searchParams.vehicle;
    if (searchParams.docType) where.docTypeId = searchParams.docType;
    if (searchParams.due === "expired") where.expiryDate = { not: null, lt: today };
    if (searchParams.due === "30") {
      const in30 = new Date(today);
      in30.setDate(in30.getDate() + 30);
      where.expiryDate = { not: null, gte: today, lte: in30 };
    }
    if (searchParams.status) where.status = searchParams.status;
    const [rows, docTypes, vehicles] = await Promise.all([
      tx.vehicleDocument.findMany({
        where,
        include: { docType: true },
        orderBy: [{ expiryDate: "asc" }],
      }),
      tx.documentType.findMany({ orderBy: { name: "asc" } }),
      tx.vehicle.findMany({ where: { isActive: true }, orderBy: { number: "asc" } }),
    ]);
    return { rows, docTypes, vehicles };
  });

  const vehicleById = new Map(vehicles.map((v) => [v.id, v.number]));
  const canDelete = session.role === "ADMIN" || session.role === "OWNER";

  return (
    <VehicleDocumentsClient embedded
      rows={rows.map((r) => ({
        id: r.id,
        docTypeId: r.docTypeId,
        docTypeName: r.docType.name,
        vehicleId: r.vehicleId,
        vehicleNumber: vehicleById.get(r.vehicleId) ?? "",
        docNo: r.docNo,
        companyName: r.companyName,
        status: r.status,
        entryDate: formatDate(r.entryDate),
        effectiveDate: r.effectiveDate ? formatDate(r.effectiveDate) : "",
        expiryDate: r.expiryDate ? formatDate(r.expiryDate) : "",
        expiredNow: !!r.expiryDate && r.expiryDate < today,
        remarks: r.remarks,
        filePath: r.filePath,
        fileName: r.fileName,
      }))}
      docTypeOptions={docTypes.map((d) => ({ value: d.id, label: d.name }))}
      vehicleOptions={vehicles.map((v) => ({ value: v.id, label: v.number }))}
      canDelete={canDelete}
    />
  );
}
