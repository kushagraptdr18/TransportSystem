-- Manual bill (kind = MANUAL): consignment-note columns on invoice lines,
-- printed in the firm's own hand-bill format (C.Note / stations / vehicle /
-- weights). Amount for these rows is GT WT x Rate.
ALTER TABLE "InvoiceLine" ADD COLUMN IF NOT EXISTS "cnNo" TEXT;
ALTER TABLE "InvoiceLine" ADD COLUMN IF NOT EXISTS "lineDate" TIMESTAMP(3);
ALTER TABLE "InvoiceLine" ADD COLUMN IF NOT EXISTS "loadingStation" TEXT;
ALTER TABLE "InvoiceLine" ADD COLUMN IF NOT EXISTS "deliveryStation" TEXT;
ALTER TABLE "InvoiceLine" ADD COLUMN IF NOT EXISTS "invoiceNo" TEXT;
ALTER TABLE "InvoiceLine" ADD COLUMN IF NOT EXISTS "vehicleNo" TEXT;
ALTER TABLE "InvoiceLine" ADD COLUMN IF NOT EXISTS "deliveryDate" TIMESTAMP(3);
ALTER TABLE "InvoiceLine" ADD COLUMN IF NOT EXISTS "wt" DECIMAL(12,3) NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceLine" ADD COLUMN IF NOT EXISTS "gtWt" DECIMAL(12,3) NOT NULL DEFAULT 0;
