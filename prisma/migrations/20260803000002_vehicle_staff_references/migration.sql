-- Vehicle expenses, staff advances and driver settlements become settleable
-- references, handled by the same outstanding engine as billing, chalans,
-- broker slips, office bills and salaries.
--
-- VoucherAllocation.refType is the ModuleLink enum, so without these values a
-- voucher physically cannot point at a vehicle expense bill or a driver's
-- settlement balance.

ALTER TYPE "ModuleLink" ADD VALUE IF NOT EXISTS 'VEHICLE_EXPENSE';
ALTER TYPE "ModuleLink" ADD VALUE IF NOT EXISTS 'STAFF_ADVANCE';
ALTER TYPE "ModuleLink" ADD VALUE IF NOT EXISTS 'DRIVER_SETTLEMENT';

-- Blank reference means "use the voucher number". Office and payroll already
-- store that concretely; vehicle expense vouchers derived it at read time, so
-- the same bill appeared under one reference in the ledger and another (empty)
-- one in the register.
UPDATE "VehicleExpenseVoucher"
   SET "refNo" = "voucherNo"
 WHERE "refNo" IS NULL OR btrim("refNo") = '';

-- Journal vouchers can credit an income/expense head, not only a bank/cash or
-- party ledger, so a journal is a true ledger-to-ledger adjustment. bankPartyId
-- becomes optional for exactly that case.
ALTER TABLE "Voucher" ADD COLUMN IF NOT EXISTS "creditHeadId" TEXT;
ALTER TABLE "Voucher" ALTER COLUMN "bankPartyId" DROP NOT NULL;
