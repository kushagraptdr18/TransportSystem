-- Manual advance adjustment in the chalan module (part 2: columns).

-- Advance-section rows point at the advance voucher they consume.
ALTER TABLE "ChalanAdvance" ADD COLUMN "advanceId" TEXT;
ALTER TABLE "ChalanAdvance" ADD COLUMN "advanceVoucherNo" TEXT;
CREATE INDEX "ChalanAdvance_advanceId_idx" ON "ChalanAdvance"("advanceId");
ALTER TABLE "ChalanAdvance" ADD CONSTRAINT "ChalanAdvance_advanceId_fkey"
  FOREIGN KEY ("advanceId") REFERENCES "PartyAdvance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Total settled from advance vouchers during the balance payment.
ALTER TABLE "Chalan" ADD COLUMN "balAdvanceAdjusted" DECIMAL(14,2) NOT NULL DEFAULT 0;
