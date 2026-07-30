-- AdBlue (Urea) litre-only stock register + trip sheet urea fields.
CREATE TABLE "AdblueTxn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "supplierName" TEXT,
    "vehicleId" TEXT,
    "destination" TEXT,
    "qty" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refNo" TEXT,
    "remarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "AdblueTxn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdblueTxn_tenantId_firmId_fyId_type_date_idx"
    ON "AdblueTxn"("tenantId", "firmId", "fyId", "type", "date");
CREATE INDEX "AdblueTxn_tenantId_vehicleId_date_idx"
    ON "AdblueTxn"("tenantId", "vehicleId", "date");

ALTER TABLE "Trip" ADD COLUMN "ureaQty" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN "ureaRate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN "ureaAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN "ureaExpenseType" TEXT NOT NULL DEFAULT 'DRIVER';

-- RLS (same policies as all tenant-scoped tables)
ALTER TABLE "AdblueTxn" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdblueTxn" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AdblueTxn"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
CREATE POLICY platform_bypass ON "AdblueTxn"
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');
