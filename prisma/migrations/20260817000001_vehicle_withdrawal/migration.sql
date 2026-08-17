-- Malik Nikasi: owner drawings against a vehicle's earnings. Reduces the
-- vehicle's running balance in the Trip P&L; never touches net profit.
CREATE TABLE IF NOT EXISTS "VehicleWithdrawal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "payPartyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "remarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "VehicleWithdrawal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VehicleWithdrawal_tenantId_firmId_vehicleId_idx"
  ON "VehicleWithdrawal"("tenantId", "firmId", "vehicleId");

-- tenant isolation, same pattern as every tenant table
ALTER TABLE "VehicleWithdrawal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VehicleWithdrawal" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "VehicleWithdrawal";
CREATE POLICY tenant_isolation ON "VehicleWithdrawal"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
DROP POLICY IF EXISTS platform_bypass ON "VehicleWithdrawal";
CREATE POLICY platform_bypass ON "VehicleWithdrawal"
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');
