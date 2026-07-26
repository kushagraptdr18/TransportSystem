-- AlterEnum
ALTER TYPE "LedgerGroup" ADD VALUE 'RELATIVE';

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "ownershipType" TEXT NOT NULL DEFAULT 'BROKER';

-- backfill: previously isOwn=true meant company/owner vehicle
UPDATE "Vehicle" SET "ownershipType" = 'OWNER' WHERE "isOwn" = true;
