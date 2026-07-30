-- Tyre Life Management: permanent tyre identity + installation cycles
-- (install / transfer / removal history, cumulative KM & days).
CREATE TABLE "Tyre" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "tyreNo" TEXT NOT NULL,
    "tyreName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Tyre_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TyreCycle" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tyreId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "instDate" TIMESTAMP(3) NOT NULL,
    "instKm" DECIMAL(12,1) NOT NULL,
    "removalDate" TIMESTAMP(3),
    "removalKm" DECIMAL(12,1),
    "removalReason" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TyreCycle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Tyre_tenantId_firmId_tyreNo_key" ON "Tyre"("tenantId", "firmId", "tyreNo");
CREATE INDEX "Tyre_tenantId_firmId_status_idx" ON "Tyre"("tenantId", "firmId", "status");
CREATE INDEX "TyreCycle_tenantId_tyreId_idx" ON "TyreCycle"("tenantId", "tyreId");
CREATE INDEX "TyreCycle_tenantId_vehicleId_idx" ON "TyreCycle"("tenantId", "vehicleId");

ALTER TABLE "TyreCycle" ADD CONSTRAINT "TyreCycle_tyreId_fkey"
    FOREIGN KEY ("tyreId") REFERENCES "Tyre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (same policies as all tenant-scoped tables)
ALTER TABLE "Tyre" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tyre" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Tyre"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
CREATE POLICY platform_bypass ON "Tyre"
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "TyreCycle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TyreCycle" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TyreCycle"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
CREATE POLICY platform_bypass ON "TyreCycle"
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');
