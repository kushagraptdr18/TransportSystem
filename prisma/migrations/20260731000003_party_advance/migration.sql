-- Party advances: auto-created by receipt vouchers, consumed by bills.
CREATE TABLE "PartyAdvance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "voucherId" TEXT,
    "voucherNo" TEXT,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "consumedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "PartyAdvance_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PartyAdvanceUse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "advanceId" TEXT NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "refNo" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartyAdvanceUse_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PartyAdvance_tenantId_firmId_partyId_idx" ON "PartyAdvance"("tenantId", "firmId", "partyId");
CREATE INDEX "PartyAdvance_tenantId_voucherId_idx" ON "PartyAdvance"("tenantId", "voucherId");
CREATE INDEX "PartyAdvanceUse_tenantId_refType_refId_idx" ON "PartyAdvanceUse"("tenantId", "refType", "refId");
CREATE INDEX "PartyAdvanceUse_advanceId_idx" ON "PartyAdvanceUse"("advanceId");
ALTER TABLE "PartyAdvanceUse" ADD CONSTRAINT "PartyAdvanceUse_advanceId_fkey"
    FOREIGN KEY ("advanceId") REFERENCES "PartyAdvance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['PartyAdvance','PartyAdvanceUse'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))', t);
    EXECUTE format('CREATE POLICY platform_bypass ON %I USING (current_setting(''app.bypass_rls'', true) = ''on'') WITH CHECK (current_setting(''app.bypass_rls'', true) = ''on'')', t);
  END LOOP;
END $$;
