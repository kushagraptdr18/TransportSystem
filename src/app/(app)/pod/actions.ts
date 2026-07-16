"use server";

import { z } from "zod";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { authorize } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { syncSequenceTo } from "@/lib/sequences";
import { toNum } from "@/lib/utils";

export interface PodPendingLr {
  id: string;
  lrNo: string;
  lrDate: string;
  source: string;
  dest: string;
  billedParty: string;
  qty: number;
  actualWt: number;
}

function mapLr(lr: {
  id: string;
  lrNo: string;
  lrDate: Date;
  items: { qty: unknown; actualWt: unknown }[];
  sourceCity?: { name: string } | null;
  destCity?: { name: string } | null;
  billedName: string;
}): PodPendingLr {
  return {
    id: lr.id,
    lrNo: lr.lrNo,
    lrDate: lr.lrDate.toISOString(),
    source: lr.sourceCity?.name ?? "",
    dest: lr.destCity?.name ?? "",
    billedParty: lr.billedName,
    qty: lr.items.reduce((s, i) => s + toNum(String(i.qty)), 0),
    actualWt: lr.items.reduce((s, i) => s + toNum(String(i.actualWt)), 0),
  };
}

/** LRs on a vehicle that have no POD yet. */
export async function getVehiclePendingPodLrs(vehicleId: string): Promise<PodPendingLr[]> {
  const session = requireSession();
  const lrs = await withTenant(session.tenantId, (tx) =>
    tx.lr.findMany({
      where: {
        firmId: session.firmId,
        fyId: session.fyId,
        vehicleId,
        deletedAt: null,
        lrType: { notIn: ["CANCELLED", "PAPER_CHANGE"] },
        status: "ON_CHALAN", // workflow: POD only after chalan is created
        pods: { none: {} },
      },
      include: { items: true },
      orderBy: { lrDate: "asc" },
    })
  );
  return withNames(session.tenantId, lrs);
}

async function withNames(
  tenantId: string,
  lrs: {
    id: string;
    lrNo: string;
    lrDate: Date;
    sourceCityId: string;
    destCityId: string;
    billToId: string | null;
    consignorId: string;
    items: { qty: unknown; actualWt: unknown }[];
  }[]
): Promise<PodPendingLr[]> {
  const cityIds = Array.from(new Set(lrs.flatMap((l) => [l.sourceCityId, l.destCityId])));
  const partyIds = Array.from(new Set(lrs.map((l) => l.billToId ?? l.consignorId)));
  const [cities, parties] = await withTenant(tenantId, async (tx) => [
    await tx.city.findMany({ where: { id: { in: cityIds } } }),
    await tx.party.findMany({ where: { id: { in: partyIds } } }),
  ]);
  const cityMap = new Map(cities.map((c) => [c.id, c.name]));
  const partyMap = new Map(parties.map((p) => [p.id, p.name]));
  return lrs.map((lr) =>
    mapLr({
      ...lr,
      sourceCity: { name: cityMap.get(lr.sourceCityId) ?? "" },
      destCity: { name: cityMap.get(lr.destCityId) ?? "" },
      billedName: partyMap.get(lr.billToId ?? lr.consignorId) ?? "",
    })
  );
}

/** Manual LR search. Blocks LRs that already have a POD. */
export async function findLrForPod(
  lrNo: string
): Promise<{ ok: true; lr: PodPendingLr } | { ok: false; error: string; alreadyPoded?: boolean }> {
  const session = requireSession();
  const lr = await withTenant(session.tenantId, (tx) =>
    tx.lr.findFirst({
      where: {
        firmId: session.firmId,
        fyId: session.fyId,
        lrNo: lrNo.trim(),
        deletedAt: null,
      },
      include: { items: true, pods: true },
    })
  );
  if (!lr) return { ok: false, error: `LR ${lrNo} not found.` };
  if (lr.lrType === "CANCELLED") return { ok: false, error: `LR ${lrNo} is cancelled.` };
  if (lr.lrType === "PAPER_CHANGE") {
    return { ok: false, error: `LR ${lrNo} is a paper-change LR — not operational.` };
  }
  if (lr.status === "PENDING") {
    return { ok: false, error: `LR ${lrNo} has no chalan yet — create the chalan first.` };
  }
  if (lr.pods.length > 0) {
    return {
      ok: false,
      alreadyPoded: true,
      error: `POD for LR ${lr.lrNo} has already been uploaded`,
    };
  }
  const [mapped] = await withNames(session.tenantId, [lr]);
  return { ok: true, lr: mapped };
}

const podLineSchema = z.object({
  lrId: z.string().min(1),
  unloadDate: z.string().nullable().optional(),
  ackNo: z.string().optional(),
  recWt: z.number().nullable().optional(),
  poNumber: z.string().optional(),
  gateEntryNo: z.string().optional(),
  remarks: z.string().optional(),
  filePath: z.string().min(1, "POD file is required"),
  fileSize: z.number().int(),
});

const podBatchSchema = z.object({
  docNo: z.string().min(1, "Document number is required"),
  docDate: z.string().min(1),
  sourceType: z.enum([
    "BOOKING",
    "OUTWARD_CROSSING",
    "CROSSING_CHALLAN",
    "GATE_PASS",
    "BROKER_SLIP",
  ]),
  vehicleId: z.string().nullable().optional(),
  refNo: z.string().optional(),
  lines: z.array(podLineSchema).min(1, "Select at least one LR"),
});

const MIN_SIZE = 2 * 1024 * 1024;

export async function savePodBatch(
  input: unknown
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  const session = requireSession();
  await authorize(session, "pod", "create");
  const parsed = podBatchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  for (const line of data.lines) {
    if (line.fileSize < MIN_SIZE) {
      return { ok: false, error: "POD file must be at least 2 MB." };
    }
    if (!line.filePath.startsWith(`${session.tenantId}/`)) {
      return { ok: false, error: "Invalid file path." };
    }
  }

  try {
    return await withTenant(session.tenantId, async (tx) => {
      const ids: string[] = [];
      for (let i = 0; i < data.lines.length; i++) {
        const line = data.lines[i];
        const lr = await tx.lr.findFirst({
          where: { id: line.lrId, firmId: session.firmId, fyId: session.fyId, deletedAt: null },
          include: { items: true, pods: true },
        });
        if (!lr) return { ok: false as const, error: "LR not found." };
        if (lr.pods.length > 0) {
          return {
            ok: false as const,
            error: `POD for LR ${lr.lrNo} has already been uploaded`,
          };
        }
        const actualWt = lr.items.reduce((s, it) => s + toNum(String(it.actualWt)), 0);
        const recWt = line.recWt ?? null;
        const shortageWt =
          recWt === null ? null : Math.round((actualWt - recWt) * 1000) / 1000;
        // one docNo covers the batch; DB uniqueness on docNo requires a suffix
        // for the 2nd row onwards of a multi-LR batch
        const docNo = i === 0 ? data.docNo : `${data.docNo}-${i + 1}`;
        const pod = await tx.pod.create({
          data: {
            tenantId: session.tenantId,
            firmId: session.firmId,
            fyId: session.fyId,
            docNo,
            docDate: new Date(data.docDate),
            sourceType: data.sourceType,
            lrId: lr.id,
            refNo: data.refNo || null,
            vehicleId: data.vehicleId || lr.vehicleId,
            unloadDate: line.unloadDate ? new Date(line.unloadDate) : null,
            ackNo: line.ackNo || null,
            actualWt,
            recWt,
            shortageWt,
            poNumber: line.poNumber || null,
            gateEntryNo: line.gateEntryNo || null,
            filePath: line.filePath,
            fileSize: line.fileSize,
            remarks: line.remarks || null,
            status: "COMPLETED",
            createdById: session.userId,
          },
        });
        await tx.lr.update({
          where: { id: lr.id },
          data: {
            status: "DELIVERED",
            poNumber: line.poNumber || lr.poNumber,
            gateEntryNo: line.gateEntryNo || lr.gateEntryNo,
          },
        });
        await audit(tx, session, {
          entity: "Pod",
          entityId: pod.id,
          action: "CREATE",
          after: pod,
        });
        ids.push(pod.id);
      }
      await syncSequenceTo(tx, {
        tenantId: session.tenantId,
        firmId: session.firmId,
        fyId: session.fyId,
        docType: "POD",
        savedNumber: data.docNo,
      });
      return { ok: true as const, ids };
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Save failed";
    if (msg.includes("Unique constraint")) {
      return { ok: false, error: `POD document number ${data.docNo} already exists.` };
    }
    return { ok: false, error: msg };
  }
}

const podUpdateSchema = z.object({
  id: z.string().min(1),
  docDate: z.string().min(1, "Document date is required"),
  unloadDate: z.string().nullable().optional(),
  ackNo: z.string().optional(),
  recWt: z.number().nullable().optional(),
  poNumber: z.string().optional(),
  gateEntryNo: z.string().optional(),
  remarks: z.string().optional(),
});

/** Edit an existing POD's details (file stays as uploaded). */
export async function updatePod(
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  await authorize(session, "pod", "edit");
  const parsed = podUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  try {
    return await withTenant(session.tenantId, async (tx) => {
      const before = await tx.pod.findFirst({
        where: { id: data.id, firmId: session.firmId },
        include: { lr: { include: { items: true } } },
      });
      if (!before) return { ok: false as const, error: "POD not found." };
      const actualWt =
        before.lr?.items.reduce((s, it) => s + toNum(it.actualWt), 0) ??
        (before.actualWt == null ? 0 : toNum(before.actualWt));
      const recWt = data.recWt ?? null;
      const shortageWt = recWt === null ? null : Math.round((actualWt - recWt) * 1000) / 1000;
      const after = await tx.pod.update({
        where: { id: data.id },
        data: {
          docDate: new Date(data.docDate),
          unloadDate: data.unloadDate ? new Date(data.unloadDate) : null,
          ackNo: data.ackNo || null,
          recWt,
          shortageWt,
          poNumber: data.poNumber || null,
          gateEntryNo: data.gateEntryNo || null,
          remarks: data.remarks || null,
        },
      });
      await audit(tx, session, {
        entity: "Pod",
        entityId: data.id,
        action: "UPDATE",
        before,
        after,
      });
      return { ok: true as const };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed" };
  }
}

/** Delete a POD; the LR returns to ON_CHALAN so a fresh POD can be uploaded. */
export async function deletePod(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  if (session.role !== "ADMIN" && session.role !== "OWNER") {
    return { ok: false, error: "Only Admin/Owner may delete PODs." };
  }
  await authorize(session, "pod", "delete");
  try {
    return await withTenant(session.tenantId, async (tx) => {
      const pod = await tx.pod.findFirst({
        where: { id, firmId: session.firmId },
        include: { lr: { include: { invoiceLrs: true } } },
      });
      if (!pod) return { ok: false as const, error: "POD not found." };
      if (pod.lr && (pod.lr.status === "BILLED" || pod.lr.invoiceLrs.length > 0)) {
        return {
          ok: false as const,
          error: `LR ${pod.lr.lrNo} is already billed — delete the bill before removing its POD.`,
        };
      }
      await tx.pod.delete({ where: { id } });
      if (pod.lrId) {
        await tx.lr.update({ where: { id: pod.lrId }, data: { status: "ON_CHALAN" } });
      }
      await audit(tx, session, { entity: "Pod", entityId: id, action: "DELETE", before: pod });
      return { ok: true as const };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed" };
  }
}
