-- Trip Sheet redesign: settlement fields on Trip + TripDoc links (a chalan /
-- broker slip settles in exactly one trip sheet).
CREATE TABLE "TripDoc" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripDoc_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TripDoc_tenantId_refType_refId_key" ON "TripDoc"("tenantId", "refType", "refId");
CREATE INDEX "TripDoc_tripId_idx" ON "TripDoc"("tripId");

ALTER TABLE "Trip" ADD COLUMN "calcMethod" TEXT NOT NULL DEFAULT 'DIESEL_AVG';
ALTER TABLE "Trip" ADD COLUMN "fromDate" TIMESTAMP(3);
ALTER TABLE "Trip" ADD COLUMN "toDate" TIMESTAMP(3);
ALTER TABLE "Trip" ADD COLUMN "tollExpenseType" TEXT NOT NULL DEFAULT 'DRIVER';
ALTER TABLE "Trip" ADD COLUMN "tollAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN "actualDiesel" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN "actualAdvance" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN "loadingKm" DECIMAL(12,1) NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN "unloadingKm" DECIMAL(12,1) NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN "newLoadingKm" DECIMAL(12,1) NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN "dieselAvg" DECIMAL(8,2) NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN "dieselRate" DECIMAL(8,2) NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN "apprDriverAdvance" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN "roadBillExp" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN "foodingDays" DECIMAL(6,1) NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN "foodingRate" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN "rtoExp" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN "fixedTripExp" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN "actualTotal" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN "approvedTotal" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "TripDoc" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TripDoc" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TripDoc"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
CREATE POLICY platform_bypass ON "TripDoc"
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');
