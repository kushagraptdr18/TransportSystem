-- Broker slip: independent rate basis per side + POD file upload from the register
ALTER TABLE "BrokerSlip" ADD COLUMN "pRateBasis" "RateBasis" NOT NULL DEFAULT 'CHARGE_WT';
ALTER TABLE "BrokerSlip" ADD COLUMN "vRateBasis" "RateBasis" NOT NULL DEFAULT 'CHARGE_WT';
-- existing slips keep their single shared basis on both sides
UPDATE "BrokerSlip" SET "pRateBasis" = "rateBasis", "vRateBasis" = "rateBasis";

ALTER TABLE "BrokerSlip" ADD COLUMN "podFilePath" TEXT;
ALTER TABLE "BrokerSlip" ADD COLUMN "podFileName" TEXT;
ALTER TABLE "BrokerSlip" ADD COLUMN "podUploadDate" TIMESTAMP(3);
