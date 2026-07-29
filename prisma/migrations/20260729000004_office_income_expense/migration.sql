-- Office Income & Expense Management: auto-posted office transactions
CREATE TABLE "OfficeTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "voucherNo" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "txnType" TEXT NOT NULL,
    "headId" TEXT NOT NULL,
    "partyId" TEXT,
    "paymentMode" TEXT NOT NULL DEFAULT 'CASH',
    "bankPartyId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gstPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "gstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refNo" TEXT,
    "remarks" TEXT,
    "attachmentPath" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "OfficeTransaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OfficeTransaction_firmId_fyId_voucherNo_key" ON "OfficeTransaction"("firmId", "fyId", "voucherNo");
CREATE INDEX "OfficeTransaction_tenantId_firmId_fyId_txnType_idx" ON "OfficeTransaction"("tenantId", "firmId", "fyId", "txnType");
CREATE INDEX "OfficeTransaction_tenantId_partyId_idx" ON "OfficeTransaction"("tenantId", "partyId");

ALTER TABLE "OfficeTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OfficeTransaction" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OfficeTransaction"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
CREATE POLICY platform_bypass ON "OfficeTransaction"
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');
