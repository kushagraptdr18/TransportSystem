-- Vehicle module tweaks: separate payment date on expense vouchers; adjusted
-- date on driver advances (set when a trip sheet consumes the advance).
ALTER TABLE "VehicleExpenseVoucher" ADD COLUMN "paymentDate" TIMESTAMP(3);
ALTER TABLE "DriverAdvance" ADD COLUMN "adjustedDate" TIMESTAMP(3);
