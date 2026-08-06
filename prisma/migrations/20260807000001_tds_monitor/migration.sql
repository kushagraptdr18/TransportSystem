-- TDS threshold monitoring: sections (with connected expense heads) and a
-- record of what was actually deducted per party+section.

CREATE TABLE IF NOT EXISTS "TdsSection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "oldCode" TEXT,
    "name" TEXT NOT NULL,
    "annualLimit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "singleBillLimit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "rateIndividual" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "rateCompany" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "basis" TEXT NOT NULL DEFAULT 'FULL',
    "headIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "TdsSection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TdsSection_tenantId_idx" ON "TdsSection"("tenantId");

CREATE TABLE IF NOT EXISTS "TdsDeduction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "TdsDeduction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TdsDeduction_tenantId_firmId_fyId_partyId_sectionId_idx"
    ON "TdsDeduction"("tenantId", "firmId", "fyId", "partyId", "sectionId");

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['TdsSection','TdsDeduction'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS platform_bypass ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))', t);
    EXECUTE format('CREATE POLICY platform_bypass ON %I USING (current_setting(''app.bypass_rls'', true) = ''on'') WITH CHECK (current_setting(''app.bypass_rls'', true) = ''on'')', t);
  END LOOP;
END $$;
