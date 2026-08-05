-- Extra Work Information (Vehicle module): pure tracking of workshop jobs.
-- No accounting impact; status is derived from "completeDate" in code.

CREATE TABLE IF NOT EXISTS "VehicleWork" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "supplier" TEXT,
    "completeDate" TIMESTAMP(3),
    "remarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "VehicleWork_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VehicleWork_tenantId_firmId_fyId_vehicleId_idx"
    ON "VehicleWork"("tenantId", "firmId", "fyId", "vehicleId");
CREATE INDEX IF NOT EXISTS "VehicleWork_tenantId_firmId_fyId_workDate_idx"
    ON "VehicleWork"("tenantId", "firmId", "fyId", "workDate");

-- same tenant-isolation policies every other table carries
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['VehicleWork'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS platform_bypass ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))', t);
    EXECUTE format('CREATE POLICY platform_bypass ON %I USING (current_setting(''app.bypass_rls'', true) = ''on'') WITH CHECK (current_setting(''app.bypass_rls'', true) = ''on'')', t);
  END LOOP;
END $$;
