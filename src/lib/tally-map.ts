/**
 * Tally ledger-mapping concepts: the fixed software-side posting slots each
 * module uses, keyed for the TallyLedgerMap table. Account heads and banks
 * are mapped by their row ids (module HEAD / BANKCASH) and listed
 * dynamically on the settings screen.
 *
 * A missing/blank mapping falls back to the software-side name — Tally
 * auto-creates that ledger on import, so exports never block on the mapping.
 */

export interface TallyConcept {
  key: string;
  label: string;
  hint?: string;
  fallback: string;
}

export const CHALAN_CONCEPTS: TallyConcept[] = [
  {
    key: "freight_decl",
    label: "Freight / Lorry Hire — Declaration broker",
    hint: "broker whose TDS mode is Declaration",
    fallback: "TRANSPORTING EXP (DECLARATION)",
  },
  {
    key: "freight_tds",
    label: "Freight / Lorry Hire — TDS broker",
    fallback: "TRANSPORTING EXP (TDS)",
  },
  { key: "detention", label: "Detention", fallback: "DETENTION CHARGES" },
  { key: "odc", label: "ODC", fallback: "ODC CHARGES" },
  { key: "fine_slip", label: "Fine Slip", fallback: "FINE SLIP CHARGES" },
  { key: "other", label: "Other Charges", fallback: "OTHER CHALAN CHARGES" },
  { key: "tds", label: "TDS Payable (broker se kata)", fallback: "TDS ON TRANSPORT 194C" },
  { key: "commission", label: "Commission", fallback: "COMMISSION INCOME" },
  { key: "mamool", label: "Mamool", fallback: "MAMOOL INCOME" },
  { key: "courier", label: "Courier", fallback: "COURIER CHARGES" },
  { key: "ld", label: "LD Charge", fallback: "LD CHARGE RECOVERED" },
  { key: "shortage", label: "Shortage", fallback: "SHORTAGE RECOVERY" },
  { key: "round_off", label: "Round Off", fallback: "ROUND OFF" },
  { key: "cash", label: "Cash ledger (cash advances)", fallback: "CASH" },
];

export const BILLING_CONCEPTS: TallyConcept[] = [
  {
    key: "sales",
    label: "Sales ledger (pura bill amount ek saath)",
    fallback: "FREIGHT RECEIPTS",
  },
  { key: "tds_recv", label: "TDS Receivable (party ne kata)", fallback: "TDS RECEIVABLE 194C" },
  { key: "shortage", label: "Shortage", fallback: "SHORTAGE" },
  { key: "round_off", label: "Round Off", fallback: "ROUND OFF" },
];

export const SLIP_P_CONCEPTS: TallyConcept[] = [
  { key: "freight_income", label: "Freight (party side)", fallback: "FREIGHT RECEIPTS" },
  { key: "detention_income", label: "Detention (party side)", fallback: "DETENTION INCOME" },
  { key: "odc_income", label: "ODC (party side)", fallback: "ODC INCOME" },
  { key: "fine_income", label: "Fine Slip (party side)", fallback: "FINE SLIP INCOME" },
  { key: "comm_allowed", label: "Commission (party ne kata)", fallback: "COMMISSION ALLOWED" },
  { key: "mamool_allowed", label: "Mamool (party ne kata)", fallback: "MAMOOL ALLOWED" },
  { key: "tds_recv", label: "TDS Receivable (party ne kata)", fallback: "TDS RECEIVABLE 194C" },
  { key: "shortage", label: "Shortage (party side)", fallback: "SHORTAGE" },
];

export const OFFICE_CONCEPTS: TallyConcept[] = [
  { key: "round_off", label: "Round Off", fallback: "ROUND OFF" },
];

export interface TallyMapRow {
  module: string;
  sourceKey: string;
  tallyName: string;
}

export type TallyLookup = (module: string, sourceKey: string, fallback: string) => string;

export function makeTallyLookup(rows: TallyMapRow[]): TallyLookup {
  const map = new Map(rows.map((r) => [`${r.module}:${r.sourceKey}`, r.tallyName]));
  return (module, sourceKey, fallback) => {
    const v = map.get(`${module}:${sourceKey}`)?.trim();
    return v || fallback;
  };
}
