-- Running salary balance: partial salary payments + partial shortage adjustment.
ALTER TABLE "DriverSalary" ADD COLUMN "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "DriverShortage" ADD COLUMN "adjustedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;
