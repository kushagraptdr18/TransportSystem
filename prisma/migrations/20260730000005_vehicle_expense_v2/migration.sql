-- Vehicle Expenses v2: accounting voucher + vehicle-wise allocation items;
-- AdBlue refill gains optional purchase amount + paying account.
CREATE TABLE "VehicleExpenseVoucher" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "voucherNo" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "txnType" TEXT NOT NULL DEFAULT 'EXPENSE',
    "headId" TEXT NOT NULL,
    "partyId" TEXT,
    "paymentMode" TEXT,
    "bankPartyId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "refNo" TEXT,
    "remarks" TEXT,
    "attachmentPath" TEXT,
    "attachmentName" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "VehicleExpenseVoucher_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VehicleExpenseItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    CONSTRAINT "VehicleExpenseItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VehicleExpenseVoucher_firmId_fyId_voucherNo_key"
    ON "VehicleExpenseVoucher"("firmId", "fyId", "voucherNo");
CREATE INDEX "VehicleExpenseVoucher_tenantId_firmId_fyId_date_idx"
    ON "VehicleExpenseVoucher"("tenantId", "firmId", "fyId", "date");
CREATE INDEX "VehicleExpenseItem_tenantId_vehicleId_idx"
    ON "VehicleExpenseItem"("tenantId", "vehicleId");
CREATE INDEX "VehicleExpenseItem_voucherId_idx" ON "VehicleExpenseItem"("voucherId");

ALTER TABLE "VehicleExpenseItem" ADD CONSTRAINT "VehicleExpenseItem_voucherId_fkey"
    FOREIGN KEY ("voucherId") REFERENCES "VehicleExpenseVoucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdblueTxn" ADD COLUMN "amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "AdblueTxn" ADD COLUMN "bankPartyId" TEXT;

-- RLS (same policies as all tenant-scoped tables)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['VehicleExpenseVoucher','VehicleExpenseItem'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))', t);
    EXECUTE format('CREATE POLICY platform_bypass ON %I USING (current_setting(''app.bypass_rls'', true) = ''on'') WITH CHECK (current_setting(''app.bypass_rls'', true) = ''on'')', t);
  END LOOP;
END $$;
