-- Driver Management: master + documents, vehicle assignment history, advances,
-- shortages, salary, +/- settlement register; Trip gains driverId/driverBalance.
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "driverCode" TEXT NOT NULL,
    "partyId" TEXT,
    "name" TEXT NOT NULL,
    "mobile" TEXT,
    "emergencyContact" TEXT,
    "address" TEXT,
    "joinDate" TIMESTAMP(3),
    "exitDate" TIMESTAMP(3),
    "exitReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "remarks" TEXT,
    "licencePath" TEXT, "licenceName" TEXT,
    "aadhaarPath" TEXT, "aadhaarName" TEXT,
    "panPath" TEXT, "panName" TEXT,
    "photoPath" TEXT, "photoName" TEXT,
    "medicalPath" TEXT, "medicalName" TEXT,
    "policePath" TEXT, "policeName" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DriverDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DriverDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DriverAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3),
    "reason" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DriverAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DriverAdvance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "tripRef" TEXT,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentMode" TEXT NOT NULL DEFAULT 'CASH',
    "bankPartyId" TEXT,
    "voucherRef" TEXT,
    "remarks" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "tripId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "DriverAdvance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DriverShortage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "driverId" TEXT NOT NULL,
    "tripRef" TEXT,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "salaryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "DriverShortage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DriverSettlement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "tripId" TEXT,
    "tripRef" TEXT,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "settledDate" TIMESTAMP(3),
    "voucherId" TEXT,
    "voucherNo" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "DriverSettlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DriverSalary" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "salaryAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "incentive" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bonus" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherAllowance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "advanceAdjust" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shortageDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherDeductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netPayable" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentDate" TIMESTAMP(3),
    "paymentHeadId" TEXT,
    "remarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "DriverSalary_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Trip" ADD COLUMN "driverId" TEXT;
ALTER TABLE "Trip" ADD COLUMN "driverBalance" DECIMAL(14,2) NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "Driver_tenantId_firmId_driverCode_key" ON "Driver"("tenantId", "firmId", "driverCode");
CREATE INDEX "Driver_tenantId_firmId_status_idx" ON "Driver"("tenantId", "firmId", "status");
CREATE INDEX "DriverDocument_tenantId_driverId_idx" ON "DriverDocument"("tenantId", "driverId");
CREATE INDEX "DriverAssignment_tenantId_driverId_idx" ON "DriverAssignment"("tenantId", "driverId");
CREATE INDEX "DriverAssignment_tenantId_vehicleId_idx" ON "DriverAssignment"("tenantId", "vehicleId");
CREATE INDEX "DriverAdvance_tenantId_firmId_driverId_date_idx" ON "DriverAdvance"("tenantId", "firmId", "driverId", "date");
CREATE INDEX "DriverAdvance_tenantId_tripId_idx" ON "DriverAdvance"("tenantId", "tripId");
CREATE INDEX "DriverShortage_tenantId_firmId_driverId_status_idx" ON "DriverShortage"("tenantId", "firmId", "driverId", "status");
CREATE UNIQUE INDEX "DriverSettlement_tenantId_tripId_key" ON "DriverSettlement"("tenantId", "tripId");
CREATE INDEX "DriverSettlement_tenantId_firmId_driverId_status_idx" ON "DriverSettlement"("tenantId", "firmId", "driverId", "status");
CREATE UNIQUE INDEX "DriverSalary_firmId_fyId_driverId_month_key" ON "DriverSalary"("firmId", "fyId", "driverId", "month");
CREATE INDEX "DriverSalary_tenantId_driverId_idx" ON "DriverSalary"("tenantId", "driverId");

ALTER TABLE "DriverDocument" ADD CONSTRAINT "DriverDocument_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DriverAssignment" ADD CONSTRAINT "DriverAssignment_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (same policies as all tenant-scoped tables)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['Driver','DriverDocument','DriverAssignment','DriverAdvance','DriverShortage','DriverSettlement','DriverSalary'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))', t);
    EXECUTE format('CREATE POLICY platform_bypass ON %I USING (current_setting(''app.bypass_rls'', true) = ''on'') WITH CHECK (current_setting(''app.bypass_rls'', true) = ''on'')', t);
  END LOOP;
END $$;
