-- Tally export: ledger mapping (Settings screen) + export register, and a
-- per-party Tally ledger-name override.
ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "tallyName" TEXT;

CREATE TABLE IF NOT EXISTS "TallyLedgerMap" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "tallyName" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TallyLedgerMap_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TallyLedgerMap_firmId_module_sourceKey_key"
  ON "TallyLedgerMap"("firmId", "module", "sourceKey");
CREATE INDEX IF NOT EXISTS "TallyLedgerMap_tenantId_idx" ON "TallyLedgerMap"("tenantId");

CREATE TABLE IF NOT EXISTS "TallyExportEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "exportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TallyExportEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TallyExportEntry_firmId_key_key"
  ON "TallyExportEntry"("firmId", "key");
CREATE INDEX IF NOT EXISTS "TallyExportEntry_tenantId_idx" ON "TallyExportEntry"("tenantId");

-- tenant isolation, same pattern as every tenant table
ALTER TABLE "TallyLedgerMap" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TallyLedgerMap" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TallyLedgerMap";
CREATE POLICY tenant_isolation ON "TallyLedgerMap"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
DROP POLICY IF EXISTS platform_bypass ON "TallyLedgerMap";
CREATE POLICY platform_bypass ON "TallyLedgerMap"
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "TallyExportEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TallyExportEntry" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TallyExportEntry";
CREATE POLICY tenant_isolation ON "TallyExportEntry"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
DROP POLICY IF EXISTS platform_bypass ON "TallyExportEntry";
CREATE POLICY platform_bypass ON "TallyExportEntry"
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');
