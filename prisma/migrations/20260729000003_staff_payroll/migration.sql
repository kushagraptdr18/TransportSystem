-- Staff Payroll & Advance Management: employment profile, advances, loans,
-- monthly salary processing (all ledger-posted; history immutable).
CREATE TABLE "StaffProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "employeeId" TEXT,
    "department" TEXT,
    "designation" TEXT,
    "joiningDate" TIMESTAMP(3),
    "basicSalary" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "allowances" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StaffProfile_partyId_key" ON "StaffProfile"("partyId");
CREATE INDEX "StaffProfile_tenantId_idx" ON "StaffProfile"("tenantId");

CREATE TABLE "StaffAdvance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "advanceNo" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "headId" TEXT,
    "remarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "StaffAdvance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StaffAdvance_firmId_fyId_advanceNo_key" ON "StaffAdvance"("firmId", "fyId", "advanceNo");
CREATE INDEX "StaffAdvance_tenantId_partyId_idx" ON "StaffAdvance"("tenantId", "partyId");

CREATE TABLE "StaffLoan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "loanNo" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "emiAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "headId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "remarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "StaffLoan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StaffLoan_firmId_fyId_loanNo_key" ON "StaffLoan"("firmId", "fyId", "loanNo");
CREATE INDEX "StaffLoan_tenantId_partyId_idx" ON "StaffLoan"("tenantId", "partyId");

CREATE TABLE "StaffSalary" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "basic" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "allowances" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "overtime" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "incentives" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bonus" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherEarnings" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "attendanceAdj" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "leaveDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "penalties" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherDeductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "advanceId" TEXT,
    "advanceRecovery" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "loanId" TEXT,
    "loanRecovery" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grossSalary" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netSalary" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentDate" TIMESTAMP(3),
    "paymentHeadId" TEXT,
    "remarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "StaffSalary_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StaffSalary_firmId_fyId_partyId_month_key" ON "StaffSalary"("firmId", "fyId", "partyId", "month");
CREATE INDEX "StaffSalary_tenantId_partyId_idx" ON "StaffSalary"("tenantId", "partyId");

-- RLS for all four tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['StaffProfile','StaffAdvance','StaffLoan','StaffSalary']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))', t);
    EXECUTE format(
      'CREATE POLICY platform_bypass ON %I USING (current_setting(''app.bypass_rls'', true) = ''on'') WITH CHECK (current_setting(''app.bypass_rls'', true) = ''on'')', t);
  END LOOP;
END $$;
