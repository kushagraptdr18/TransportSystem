-- AdBlue / Urea stock can be received before the supplier's invoice arrives.
--
-- A refill now records stock first (date, supplier, litres) and carries no
-- accounting at all until the bill is entered on the SAME record. Once billed it
-- posts Urea Expense Dr / Supplier Cr, and — if it was paid on the spot —
-- Supplier Dr / Cash-Bank Cr. Left on credit it becomes a payable the Payment
-- Voucher can settle, which is what the new ModuleLink value is for.

ALTER TABLE "AdblueTxn" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;
ALTER TABLE "AdblueTxn" ADD COLUMN IF NOT EXISTS "billNo" TEXT;
ALTER TABLE "AdblueTxn" ADD COLUMN IF NOT EXISTS "billDate" TIMESTAMP(3);
ALTER TABLE "AdblueTxn" ADD COLUMN IF NOT EXISTS "gstPct" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "AdblueTxn" ADD COLUMN IF NOT EXISTS "gstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "AdblueTxn" ADD COLUMN IF NOT EXISTS "paymentMode" TEXT;

-- Refills entered before this change posted only when a bank/cash account was
-- chosen, which is exactly what "paid on the spot" means — record that so their
-- accounting is reproduced identically on the next save.
UPDATE "AdblueTxn"
   SET "paymentMode" = 'BANK'
 WHERE "type" = 'REFILL' AND "bankPartyId" IS NOT NULL AND "paymentMode" IS NULL;

-- A refill that already carries a purchase value was billed at entry; its
-- reference number was the bill number in practice.
UPDATE "AdblueTxn"
   SET "billNo" = "refNo", "billDate" = "date"
 WHERE "type" = 'REFILL' AND "amount" > 0 AND "billNo" IS NULL;

CREATE INDEX IF NOT EXISTS "AdblueTxn_tenantId_supplierId_idx" ON "AdblueTxn" ("tenantId", "supplierId");

-- an unbilled or credit refill is a payable the Payment Voucher settles
ALTER TYPE "ModuleLink" ADD VALUE IF NOT EXISTS 'ADBLUE_PURCHASE';
