import type { Prisma } from "@prisma/client";

/**
 * Shared filter for the Audit Challan Register. The register grid, the Excel
 * export and Bulk Print all read the same searchParams, so a date range or
 * search typed once produces the same set everywhere — 100 rows on screen
 * means 100 pages in the bulk PDF.
 *
 * Firm-scoped but not FY-scoped on purpose: this register holds historical
 * reference data that must survive a financial-year switch.
 */
export interface AuditChalanFilters {
  date_from?: string;
  date_to?: string;
  q?: string;
}

export function buildAuditChalanWhere(
  firmId: string,
  { date_from, date_to, q }: AuditChalanFilters
): Prisma.AuditChalanWhereInput {
  const search = (q ?? "").trim();
  return {
    firmId,
    deletedAt: null,
    ...(date_from || date_to
      ? {
          chalanDate: {
            ...(date_from ? { gte: new Date(date_from + "T00:00:00") } : {}),
            ...(date_to ? { lte: new Date(date_to + "T23:59:59") } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { chalanNo: { contains: search, mode: "insensitive" as const } },
            { transportName: { contains: search, mode: "insensitive" as const } },
            { ownerName: { contains: search, mode: "insensitive" as const } },
            { panCard: { contains: search, mode: "insensitive" as const } },
            { loadingFrom: { contains: search, mode: "insensitive" as const } },
            { toLocation: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}
