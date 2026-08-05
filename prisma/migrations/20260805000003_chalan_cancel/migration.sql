-- Chalan cancel (accident / goods rejection): the chalan record stays with a
-- cancelled stamp; advances already given convert into an open PartyAdvance
-- tagged CHALAN_CANCEL so they list in their own register.

ALTER TABLE "Chalan" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Chalan" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;

ALTER TABLE "PartyAdvance" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'VOUCHER';
ALTER TABLE "PartyAdvance" ADD COLUMN IF NOT EXISTS "sourceRefId" TEXT;
