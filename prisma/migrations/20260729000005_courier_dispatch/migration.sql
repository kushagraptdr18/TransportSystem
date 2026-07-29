-- Courier Dispatch register: fully manual module (no master links); one
-- dispatch holds unlimited vehicle/document rows, searchable by vehicle no.
CREATE TABLE "CourierDispatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "dispatchNo" TEXT NOT NULL,
    "dispatchDate" TIMESTAMP(3) NOT NULL,
    "courierCompany" TEXT NOT NULL,
    "trackingNo" TEXT,
    "partyName" TEXT NOT NULL,
    "remarks" TEXT,
    "attachmentPath" TEXT,
    "attachmentName" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "CourierDispatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourierDispatchItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "vehicleNo" TEXT NOT NULL,
    "documentDetails" TEXT NOT NULL,
    "remarks" TEXT,
    CONSTRAINT "CourierDispatchItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourierDispatch_firmId_fyId_dispatchNo_key"
    ON "CourierDispatch"("firmId", "fyId", "dispatchNo");
CREATE INDEX "CourierDispatch_tenantId_firmId_fyId_dispatchDate_idx"
    ON "CourierDispatch"("tenantId", "firmId", "fyId", "dispatchDate");
CREATE INDEX "CourierDispatchItem_tenantId_vehicleNo_idx"
    ON "CourierDispatchItem"("tenantId", "vehicleNo");
CREATE INDEX "CourierDispatchItem_dispatchId_idx"
    ON "CourierDispatchItem"("dispatchId");

ALTER TABLE "CourierDispatchItem" ADD CONSTRAINT "CourierDispatchItem_dispatchId_fkey"
    FOREIGN KEY ("dispatchId") REFERENCES "CourierDispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (same policies as all tenant-scoped tables)
ALTER TABLE "CourierDispatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourierDispatch" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CourierDispatch"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
CREATE POLICY platform_bypass ON "CourierDispatch"
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "CourierDispatchItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourierDispatchItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CourierDispatchItem"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
CREATE POLICY platform_bypass ON "CourierDispatchItem"
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');
