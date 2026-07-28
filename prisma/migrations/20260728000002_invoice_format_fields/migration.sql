-- Professional invoice format: firm IBA code + RCM-covered flag, invoice SAC code
ALTER TABLE "Firm" ADD COLUMN "ibaCode" TEXT;
ALTER TABLE "Firm" ADD COLUMN "rcmCovered" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Invoice" ADD COLUMN "sacCode" TEXT;
