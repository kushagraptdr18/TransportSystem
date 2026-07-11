import { Tx } from "./db";
import { DocNumberType } from "@prisma/client";

/**
 * Next document number for a firm+FY+docType. Transactional: call inside the
 * same transaction that inserts the document. Numbers are seeded by the first
 * manual entry, auto-increment after, and stay editable (uniqueness enforced
 * by DB constraints on the document tables).
 */
export async function nextDocNumber(
  tx: Tx,
  args: { tenantId: string; firmId: string; fyId: string; docType: DocNumberType }
): Promise<string> {
  const seq = await tx.documentSequence.upsert({
    where: {
      firmId_fyId_docType: {
        firmId: args.firmId,
        fyId: args.fyId,
        docType: args.docType,
      },
    },
    create: { ...args, next: 2 },
    update: { next: { increment: 1 } },
  });
  // when created, current number = 1 (next stored as 2); when updated, the
  // pre-increment value was seq.next - 1
  const current = seq.next - 1;
  return `${seq.prefix}${current}`;
}

/** After saving a manually-entered number, bump the sequence past it. */
export async function syncSequenceTo(
  tx: Tx,
  args: {
    tenantId: string;
    firmId: string;
    fyId: string;
    docType: DocNumberType;
    savedNumber: string;
  }
): Promise<void> {
  const n = parseInt(args.savedNumber.replace(/\D/g, ""), 10);
  if (isNaN(n)) return;
  await tx.documentSequence.upsert({
    where: {
      firmId_fyId_docType: {
        firmId: args.firmId,
        fyId: args.fyId,
        docType: args.docType,
      },
    },
    create: {
      tenantId: args.tenantId,
      firmId: args.firmId,
      fyId: args.fyId,
      docType: args.docType,
      next: n + 1,
    },
    update: {},
  });
  await tx.documentSequence.updateMany({
    where: {
      firmId: args.firmId,
      fyId: args.fyId,
      docType: args.docType,
      next: { lte: n },
    },
    data: { next: n + 1 },
  });
}

/** Peek at the next number without consuming it (for form prefill). */
export async function peekDocNumber(
  tx: Tx,
  args: { firmId: string; fyId: string; docType: DocNumberType }
): Promise<string | null> {
  const seq = await tx.documentSequence.findUnique({
    where: {
      firmId_fyId_docType: {
        firmId: args.firmId,
        fyId: args.fyId,
        docType: args.docType,
      },
    },
  });
  return seq ? `${seq.prefix}${seq.next}` : null;
}
