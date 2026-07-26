-- AlterTable
ALTER TABLE "Chalan" ADD COLUMN     "balPaidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "balPaymentDate" TIMESTAMP(3),
ADD COLUMN     "balPaymentHeadId" TEXT,
ADD COLUMN     "balPaymentMode" TEXT,
ADD COLUMN     "balRemarks" TEXT,
ADD COLUMN     "balRoundOff" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "balShortage" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING';
