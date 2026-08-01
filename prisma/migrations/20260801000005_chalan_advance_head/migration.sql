-- An expense-head advance is money spent on the owner's behalf, so it must
-- credit the head the user actually chose (Diesel, Toll, Repairs...) and clear
-- that expense. The chosen head was previously written into "bankPartyId" and
-- then ignored at posting time, which credited an auto-generated
-- "<Type> Advance (Chalan)" head instead and left the real expense open.
ALTER TABLE "ChalanAdvance" ADD COLUMN "headId" TEXT;

-- Backfill: HEAD-type rows stored the head id in bankPartyId. Those ids point
-- at AccountHead, never Party, so only migrate the ones that resolve.
UPDATE "ChalanAdvance" ca
SET "headId" = ca."bankPartyId"
WHERE ca."bankPartyId" IS NOT NULL
  AND ca."type" NOT IN ('BANK', 'CASH', 'ADVANCE_ADJ')
  AND EXISTS (SELECT 1 FROM "AccountHead" h WHERE h."id" = ca."bankPartyId");

UPDATE "ChalanAdvance" SET "bankPartyId" = NULL WHERE "headId" IS NOT NULL;
