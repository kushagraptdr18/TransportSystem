-- Module tags on TDS sections: label chalan / broker-slip / hire TDS with a
-- section in the TDS Payable report (report-only; the monitor never reads them).
ALTER TABLE "TdsSection" ADD COLUMN IF NOT EXISTS "moduleRefs" TEXT[] DEFAULT ARRAY[]::TEXT[];
