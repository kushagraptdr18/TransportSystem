-- Driver Final Settlement (F&F).
CREATE TABLE "DriverFnf" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "settlementNo" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "lastWorkingDate" TIMESTAMP(3),
    "grossSalary" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "shortageAdjust" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "advanceAdjust" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "negativeAdjust" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherRecoveries" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherPayments" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "finalPayable" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentMode" TEXT,
    "bankPartyId" TEXT,
    "refNo" TEXT,
    "remarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "DriverFnf_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DriverFnf_firmId_fyId_settlementNo_key" ON "DriverFnf"("firmId", "fyId", "settlementNo");
CREATE INDEX "DriverFnf_tenantId_driverId_idx" ON "DriverFnf"("tenantId", "driverId");

ALTER TABLE "DriverFnf" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DriverFnf" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DriverFnf"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
CREATE POLICY platform_bypass ON "DriverFnf"
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');
