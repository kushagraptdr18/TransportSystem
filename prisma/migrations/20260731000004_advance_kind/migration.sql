-- Advance direction: RECEIVED (from party) vs PAID (to party).
ALTER TABLE "PartyAdvance" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'RECEIVED';
