-- The Shortage Settlement Report reads as a plain ledger, so each recovery must
-- name who it came FROM (which can differ from the party the shortage was
-- raised against), and an entry raised only to absorb an unmatched recovery
-- must be skippable so it does not show as a phantom expense.
ALTER TABLE "ShortageRecovery" ADD COLUMN "partyId"  TEXT;
ALTER TABLE "ShortageRecovery" ADD COLUMN "driverId" TEXT;
ALTER TABLE "ShortageEntry"    ADD COLUMN "autoRaised" BOOLEAN NOT NULL DEFAULT false;
