-- Broker slip: informational POD-attached flag + chalan-style balance received (party side) / balance paid (owner side)
ALTER TABLE "BrokerSlip" ADD COLUMN "podAttached" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "BrokerSlip" ADD COLUMN "pPaymentStatus" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "BrokerSlip" ADD COLUMN "pRoundOff" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "BrokerSlip" ADD COLUMN "pShortage" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "BrokerSlip" ADD COLUMN "pPaidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "BrokerSlip" ADD COLUMN "pPaymentDate" TIMESTAMP(3);
ALTER TABLE "BrokerSlip" ADD COLUMN "pPaymentHeadId" TEXT;
ALTER TABLE "BrokerSlip" ADD COLUMN "pPaymentMode" TEXT;
ALTER TABLE "BrokerSlip" ADD COLUMN "pPaymentRemarks" TEXT;

ALTER TABLE "BrokerSlip" ADD COLUMN "vPaymentStatus" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "BrokerSlip" ADD COLUMN "vRoundOff" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "BrokerSlip" ADD COLUMN "vShortage" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "BrokerSlip" ADD COLUMN "vPaidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "BrokerSlip" ADD COLUMN "vPaymentDate" TIMESTAMP(3);
ALTER TABLE "BrokerSlip" ADD COLUMN "vPaymentHeadId" TEXT;
ALTER TABLE "BrokerSlip" ADD COLUMN "vPaymentMode" TEXT;
ALTER TABLE "BrokerSlip" ADD COLUMN "vPaymentRemarks" TEXT;
