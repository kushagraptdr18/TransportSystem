-- Vehicle Tracking: live auto-saved daily snapshots, 120-day retention.
CREATE TABLE "VehicleTracking" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "transporterName" TEXT,
    "fromLocation" TEXT,
    "toLocation" TEXT,
    "currentLocation" TEXT,
    "status" TEXT,
    "remarks" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VehicleTracking_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VehicleTracking_tenantId_firmId_vehicleId_date_key"
    ON "VehicleTracking"("tenantId", "firmId", "vehicleId", "date");
CREATE INDEX "VehicleTracking_tenantId_firmId_date_idx"
    ON "VehicleTracking"("tenantId", "firmId", "date");

ALTER TABLE "VehicleTracking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VehicleTracking" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "VehicleTracking"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
CREATE POLICY platform_bypass ON "VehicleTracking"
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');
