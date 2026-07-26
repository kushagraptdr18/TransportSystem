-- AlterTable
ALTER TABLE "DocumentType" ADD COLUMN     "reminderDays" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "Party" ADD COLUMN     "transportName" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "productType" TEXT NOT NULL DEFAULT 'NORMAL';
