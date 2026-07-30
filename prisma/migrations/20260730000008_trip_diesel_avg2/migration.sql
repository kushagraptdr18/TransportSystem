-- Separate diesel average per trip distance.
ALTER TABLE "Trip" ADD COLUMN "dieselAvg2" DECIMAL(8,2) NOT NULL DEFAULT 0;
