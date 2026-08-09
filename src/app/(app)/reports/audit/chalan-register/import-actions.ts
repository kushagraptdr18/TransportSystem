"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { authorize } from "@/lib/authz";
import { audit } from "@/lib/audit";

/**
 * Audit Challan Register — Excel/CSV import.
 *
 * Two phases so the user always sees what will land before it lands:
 *   previewAuditChalanImport() -> parse + structural validation, saves nothing
 *   commitAuditChalanImport()  -> writes the confirmed rows
 *
 * Validation is strictly about this register's own shape: required columns
 * present, date readable, numbers numeric. Names are NEVER checked against
 * Transport / Owner / Party / City masters — an unknown "RAJA TPT" is valid
 * input, not an error, and no master row is ever created from an import.
 */

// not exported: a "use server" module may only export async functions
const AUDIT_TEMPLATE_HEADERS = [
  "CHALLAN NO",
  "DATE",
  "TRANSPORT NAME",
  "OWNER NAME",
  "PAN CARD",
  "LOADING FROM",
  "TO",
  "ACTUAL WT",
  "CHARGE WT",
  "FREIGHT RATE",
  "FREIGHT AMOUNT",
  "TDS AMOUNT",
  "ADVANCES IN BANK",
  "CASH",
  "DIESEL",
  "TYRE",
  "URIA",
  "OTHER",
  "BALANCE",
] as const;

/** Only these two must be present for a file to be importable. */
const REQUIRED_HEADERS = ["CHALLAN NO", "DATE"];

/** "CHALAN NO" is how the rest of this app spells it — accept both. */
const HEADER_ALIASES: Record<string, string> = {
  "CHALAN NO": "CHALLAN NO",
  "CHALLAN NO.": "CHALLAN NO",
  "CHALAN NO.": "CHALLAN NO",
  "CHALLAN NUMBER": "CHALLAN NO",
  "TO LOCATION": "TO",
  UNLOADING: "TO",
  "UNLOADING TO": "TO",
  "ADVANCE IN BANK": "ADVANCES IN BANK",
  "ADVANCES BANK": "ADVANCES IN BANK",
  "BANK ADVANCE": "ADVANCES IN BANK",
  TDS: "TDS AMOUNT",
  PAN: "PAN CARD",
  UREA: "URIA",
};

export interface AuditImportRow {
  rowNo: number;
  chalanNo: string;
  chalanDate: string; // yyyy-mm-dd
  transportName: string;
  ownerName: string;
  panCard: string;
  loadingFrom: string;
  toLocation: string;
  actualWt: number;
  chargeWt: number;
  freightRate: number;
  freightAmount: number;
  tdsAmount: number;
  advanceBank: number;
  cash: number;
  diesel: number;
  tyre: number;
  uria: number;
  other: number;
  balance: number;
  /** already present in the register (same challan no + date) */
  duplicate: boolean;
}

export interface AuditImportPreview {
  ok: boolean;
  /** rows that parsed cleanly and can be imported */
  rows: AuditImportRow[];
  /** "Row 7: invalid DATE ..." — rows that could not be read */
  errors: string[];
  /** file-level problem (missing columns, unreadable file) */
  fatal?: string;
  totalRows: number;
  duplicates: number;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

async function parseFile(
  file: File
): Promise<{ header: string[]; rows: string[][] } | { error: string }> {
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith(".csv")) {
      const all = parseCsv(await file.text());
      if (all.length === 0) return { error: "The file is empty." };
      return { header: all[0].map((h) => h.trim().toUpperCase()), rows: all.slice(1) };
    }
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) return { error: "Workbook has no sheets." };
    const header: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
      header[col - 1] = String(cell.value ?? "")
        .trim()
        .toUpperCase();
    });
    const rows: string[][] = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row: string[] = [];
      ws.getRow(r).eachCell({ includeEmpty: true }, (cell, col) => {
        const v = cell.value;
        row[col - 1] =
          v === null || v === undefined
            ? ""
            : v instanceof Date
              ? `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`
              : typeof v === "object" && "text" in (v as object)
                ? String((v as { text: string }).text)
                : String(v);
      });
      if (row.some((c) => (c ?? "").trim() !== "")) rows.push(row);
    }
    return { header, rows };
  } catch {
    return { error: "Could not read the file — upload a valid .xlsx or .csv." };
  }
}

/**
 * Accepts dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, 2-digit years and Excel serial
 * numbers. Ambiguous pairs (05/06/2025) read as DD/MM per Indian convention;
 * a part above 12 disambiguates on its own.
 */
function parseAnyDate(v: string): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  const iso = (y: number, m: number, d: number): string | null => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
  if (/^\d+(\.\d+)?$/.test(t)) {
    const serial = parseFloat(t);
    if (serial > 20000 && serial < 80000) {
      const dt = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
      return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
    }
    return null;
  }
  let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    let y = +m[3];
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    if (a > 12 && b <= 12) return iso(y, b, a);
    if (b > 12 && a <= 12) return iso(y, a, b);
    return iso(y, b, a);
  }
  const parsed = new Date(t);
  if (!isNaN(parsed.getTime())) {
    return iso(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  }
  return null;
}

/** Tolerant number read: blanks are 0, currency symbols and commas ignored. */
const num = (v: string | undefined): number => {
  const cleaned = (v ?? "").replace(/[₹,\s]/g, "").replace(/[^\d.eE+-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
};

export async function previewAuditChalanImport(fd: FormData): Promise<AuditImportPreview> {
  const session = requireSession();
  await authorize(session, "auditreg", "create");

  const empty = (fatal: string): AuditImportPreview => ({
    ok: false,
    rows: [],
    errors: [],
    fatal,
    totalRows: 0,
    duplicates: 0,
  });

  const file = fd.get("file") as File | null;
  if (!file) return empty("No file uploaded.");

  const parsed = await parseFile(file);
  if ("error" in parsed) return empty(parsed.error);

  // normalise headers through the alias table before checking requirements
  const canonical = parsed.header.map((h) => HEADER_ALIASES[h] ?? h);
  const idx = new Map<string, number>();
  canonical.forEach((h, i) => {
    if (h && !idx.has(h)) idx.set(h, i);
  });

  const missing = REQUIRED_HEADERS.filter((h) => !idx.has(h));
  if (missing.length) {
    return empty(
      `Missing required column(s): ${missing.join(", ")}. Download the template to see the expected layout.`
    );
  }

  const cell = (row: string[], header: string): string => {
    const i = idx.get(header);
    return i === undefined ? "" : (row[i] ?? "").trim();
  };

  // duplicate signature = challan no + date, matched against what is already
  // stored for this firm. Duplicates are reported, never silently dropped.
  const existing = await withTenant(session.tenantId, async (tx) =>
    tx.auditChalan.findMany({
      where: { firmId: session.firmId, deletedAt: null },
      select: { chalanNo: true, chalanDate: true },
    })
  );
  // Dates are stored as local midnight (new Date("yyyy-mm-dd" + "T00:00:00")),
  // so the signature has to read them back in local time too. toISOString()
  // would shift IST midnight to the previous day and no duplicate would ever
  // match.
  const localKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const seen = new Set(
    existing.map((e) => `${e.chalanNo.toUpperCase()}|${localKey(e.chalanDate)}`)
  );

  const rows: AuditImportRow[] = [];
  const errors: string[] = [];
  let duplicates = 0;

  for (let i = 0; i < parsed.rows.length; i++) {
    const rowNo = i + 2; // 1-based, plus the header row
    const raw = parsed.rows[i];

    const chalanNo = cell(raw, "CHALLAN NO");
    if (!chalanNo) {
      errors.push(`Row ${rowNo}: CHALLAN NO is blank.`);
      continue;
    }
    const chalanDate = parseAnyDate(cell(raw, "DATE"));
    if (!chalanDate) {
      errors.push(`Row ${rowNo}: could not read DATE "${cell(raw, "DATE")}" — use dd/mm/yyyy.`);
      continue;
    }

    const key = `${chalanNo.toUpperCase()}|${chalanDate}`;
    const duplicate = seen.has(key);
    if (duplicate) duplicates++;
    seen.add(key);

    rows.push({
      rowNo,
      chalanNo,
      chalanDate,
      // stored exactly as written — no master lookup, no normalisation
      transportName: cell(raw, "TRANSPORT NAME"),
      ownerName: cell(raw, "OWNER NAME"),
      panCard: cell(raw, "PAN CARD"),
      loadingFrom: cell(raw, "LOADING FROM"),
      toLocation: cell(raw, "TO"),
      actualWt: num(cell(raw, "ACTUAL WT")),
      chargeWt: num(cell(raw, "CHARGE WT")),
      freightRate: num(cell(raw, "FREIGHT RATE")),
      freightAmount: num(cell(raw, "FREIGHT AMOUNT")),
      tdsAmount: num(cell(raw, "TDS AMOUNT")),
      advanceBank: num(cell(raw, "ADVANCES IN BANK")),
      cash: num(cell(raw, "CASH")),
      diesel: num(cell(raw, "DIESEL")),
      tyre: num(cell(raw, "TYRE")),
      uria: num(cell(raw, "URIA")),
      other: num(cell(raw, "OTHER")),
      balance: num(cell(raw, "BALANCE")),
      duplicate,
    });
  }

  return {
    ok: rows.length > 0,
    rows,
    errors,
    totalRows: parsed.rows.length,
    duplicates,
  };
}

export interface AuditImportResult {
  ok: boolean;
  imported: number;
  skipped: number;
  error?: string;
}

/**
 * Write the confirmed preview rows. `skipDuplicates` leaves rows flagged in
 * the preview untouched; unchecked, they import as additional records (an
 * audit register may legitimately hold two papers with the same number).
 */
export async function commitAuditChalanImport(
  rows: AuditImportRow[],
  skipDuplicates: boolean
): Promise<AuditImportResult> {
  const session = requireSession();
  await authorize(session, "auditreg", "create");

  const toInsert = skipDuplicates ? rows.filter((r) => !r.duplicate) : rows;
  if (toInsert.length === 0) {
    return { ok: true, imported: 0, skipped: rows.length };
  }

  try {
    const imported = await withTenant(session.tenantId, async (tx) => {
      const res = await tx.auditChalan.createMany({
        data: toInsert.map((r) => ({
          tenantId: session.tenantId,
          firmId: session.firmId,
          fyId: session.fyId,
          chalanNo: r.chalanNo,
          chalanDate: new Date(r.chalanDate + "T00:00:00"),
          transportName: r.transportName,
          ownerName: r.ownerName,
          panCard: r.panCard,
          loadingFrom: r.loadingFrom,
          toLocation: r.toLocation,
          actualWt: r.actualWt,
          chargeWt: r.chargeWt,
          freightRate: r.freightRate,
          freightAmount: r.freightAmount,
          tdsAmount: r.tdsAmount,
          advanceBank: r.advanceBank,
          cash: r.cash,
          diesel: r.diesel,
          tyre: r.tyre,
          uria: r.uria,
          other: r.other,
          balance: r.balance,
        })),
      });
      await audit(tx, session, {
        entity: "AuditChalan",
        entityId: "IMPORT",
        action: "CREATE",
        after: { imported: res.count },
      });
      return res.count;
    });
    revalidatePath("/reports/audit/chalan-register");
    return { ok: true, imported, skipped: rows.length - toInsert.length };
  } catch (e) {
    return {
      ok: false,
      imported: 0,
      skipped: 0,
      error: e instanceof Error ? e.message : "Import failed.",
    };
  }
}

/**
 * Template workbook. Deliberately has no data-validation dropdowns: this
 * register accepts any value, so offering master-derived lists would imply a
 * constraint that does not exist.
 */
export async function downloadAuditChalanTemplate(): Promise<
  { ok: true; base64: string } | { ok: false; error: string }
> {
  const session = requireSession();
  await authorize(session, "auditreg", "view");
  try {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Audit Challan");
    ws.addRow([...AUDIT_TEMPLATE_HEADERS]);
    ws.getRow(1).font = { bold: true };
    ws.columns.forEach((c) => (c.width = 16));
    ws.addRow([
      "10001",
      "12/02/2025",
      "RAJA TPT",
      "RAKESH",
      "AABCBH8901",
      "RGH",
      "CHENNAI",
      40,
      40,
      3000,
      120000,
      1200,
      100000,
      8800,
      0,
      0,
      0,
      0,
      10000,
    ]);
    ws.addRow([]);
    ws.addRow([
      "Names are stored exactly as typed. They are not matched against any master — delete these two note rows before importing.",
    ]);
    const buf = await wb.xlsx.writeBuffer();
    return { ok: true as const, base64: Buffer.from(buf).toString("base64") };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Template generation failed." };
  }
}
