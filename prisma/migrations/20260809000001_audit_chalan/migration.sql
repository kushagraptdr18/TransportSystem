-- Audit Challan Register (Reports -> Audit Function).
-- Standalone reference/audit register. No foreign keys to Party, Vehicle,
-- City or any master: descriptive columns are plain text so imported values
-- survive verbatim. Firm-scoped, not FY-scoped, so historical rows stay
-- visible after a financial-year switch.

CREATE TABLE IF NOT EXISTS "AuditChalan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "chalanNo" TEXT NOT NULL,
    "chalanDate" TIMESTAMP(3) NOT NULL,
    "transportName" TEXT NOT NULL DEFAULT '',
    "ownerName" TEXT NOT NULL DEFAULT '',
    "panCard" TEXT NOT NULL DEFAULT '',
    "loadingFrom" TEXT NOT NULL DEFAULT '',
    "toLocation" TEXT NOT NULL DEFAULT '',
    "actualWt" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "chargeWt" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "freightRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "freightAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tdsAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "advanceBank" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cash" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "diesel" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tyre" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "uria" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "other" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "AuditChalan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditChalan_tenantId_firmId_chalanDate_idx"
    ON "AuditChalan"("tenantId", "firmId", "chalanDate");
CREATE INDEX IF NOT EXISTS "AuditChalan_tenantId_firmId_chalanNo_idx"
    ON "AuditChalan"("tenantId", "firmId", "chalanNo");

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['AuditChalan'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS platform_bypass ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))', t);
    EXECUTE format('CREATE POLICY platform_bypass ON %I USING (current_setting(''app.bypass_rls'', true) = ''on'') WITH CHECK (current_setting(''app.bypass_rls'', true) = ''on'')', t);
  END LOOP;
END $$;
