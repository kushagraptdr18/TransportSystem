-- LR numbers: unique per firm + FY among ACTIVE LRs only, so a deleted LR's
-- number can be reused. Same number in a different FY was already allowed.
DROP INDEX IF EXISTS "Lr_firmId_fyId_lrNo_key";
CREATE INDEX IF NOT EXISTS "Lr_firmId_fyId_lrNo_idx" ON "Lr"("firmId", "fyId", "lrNo");
CREATE UNIQUE INDEX IF NOT EXISTS "Lr_firmId_fyId_lrNo_active_key"
  ON "Lr"("firmId", "fyId", "lrNo")
  WHERE "deletedAt" IS NULL;
