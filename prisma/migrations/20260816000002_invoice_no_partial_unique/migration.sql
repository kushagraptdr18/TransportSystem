-- Invoice numbers: unique per firm + FY + kind among ACTIVE invoices only, so
-- a soft-deleted invoice's number can be reused. Mirrors the Lr number index.
DROP INDEX IF EXISTS "Invoice_firmId_fyId_kind_invoiceNo_key";
CREATE INDEX IF NOT EXISTS "Invoice_firmId_fyId_kind_invoiceNo_idx"
  ON "Invoice"("firmId", "fyId", "kind", "invoiceNo");
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_firmId_fyId_kind_invoiceNo_active_key"
  ON "Invoice"("firmId", "fyId", "kind", "invoiceNo")
  WHERE "deletedAt" IS NULL;
