-- Central reference-based adjustment engine: JOURNAL voucher type,
-- VOUCHER_JOURNAL sequence, and per-voucher adjustment lines.
ALTER TYPE "VoucherType" ADD VALUE IF NOT EXISTS 'JOURNAL';
ALTER TYPE "DocNumberType" ADD VALUE IF NOT EXISTS 'VOUCHER_JOURNAL';

CREATE TABLE "VoucherAdjustment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "adjustmentType" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "referenceDate" TIMESTAMP(3),
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "accountHeadId" TEXT,
    CONSTRAINT "VoucherAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VoucherAdjustment_tenantId_adjustmentType_idx"
    ON "VoucherAdjustment"("tenantId", "adjustmentType");
CREATE INDEX "VoucherAdjustment_tenantId_referenceType_referenceNo_idx"
    ON "VoucherAdjustment"("tenantId", "referenceType", "referenceNo");

ALTER TABLE "VoucherAdjustment" ADD CONSTRAINT "VoucherAdjustment_voucherId_fkey"
    FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (same policies as all tenant-scoped tables)
ALTER TABLE "VoucherAdjustment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VoucherAdjustment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "VoucherAdjustment"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
CREATE POLICY platform_bypass ON "VoucherAdjustment"
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');
