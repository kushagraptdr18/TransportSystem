-- One bill, many heads: optional head-wise line split on office and vehicle
-- expense bills. Ledger debits each line's head; supplier/bank stay on total.

CREATE TABLE IF NOT EXISTS "OfficeTxnLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "txnId" TEXT NOT NULL,
    "headId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    CONSTRAINT "OfficeTxnLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OfficeTxnLine_txnId_fkey" FOREIGN KEY ("txnId") REFERENCES "OfficeTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "OfficeTxnLine_txnId_idx" ON "OfficeTxnLine"("txnId");
CREATE INDEX IF NOT EXISTS "OfficeTxnLine_tenantId_idx" ON "OfficeTxnLine"("tenantId");

CREATE TABLE IF NOT EXISTS "VehicleExpenseLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "headId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    CONSTRAINT "VehicleExpenseLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VehicleExpenseLine_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "VehicleExpenseVoucher"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "VehicleExpenseLine_voucherId_idx" ON "VehicleExpenseLine"("voucherId");
CREATE INDEX IF NOT EXISTS "VehicleExpenseLine_tenantId_idx" ON "VehicleExpenseLine"("tenantId");

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['OfficeTxnLine','VehicleExpenseLine'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS platform_bypass ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))', t);
    EXECUTE format('CREATE POLICY platform_bypass ON %I USING (current_setting(''app.bypass_rls'', true) = ''on'') WITH CHECK (current_setting(''app.bypass_rls'', true) = ''on'')', t);
  END LOOP;
END $$;
