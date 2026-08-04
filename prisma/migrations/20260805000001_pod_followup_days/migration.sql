-- POD follow-up threshold: an LR enters the pending follow-up list this many
-- days after its LR DATE. Firm-level setting, edited in Settings -> Firm.

ALTER TABLE "Firm" ADD COLUMN IF NOT EXISTS "podFollowUpDays" INTEGER NOT NULL DEFAULT 15;
