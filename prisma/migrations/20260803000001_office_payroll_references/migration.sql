-- Office Income, Office Expense and Staff Payroll become settleable references,
-- handled by the same outstanding engine as billing, chalans and broker slips.
--
-- Three new ModuleLink values. VoucherAllocation.refType is this enum, so
-- without them a voucher physically cannot point at an office bill or a salary.

ALTER TYPE "ModuleLink" ADD VALUE IF NOT EXISTS 'OFFICE_EXPENSE';
ALTER TYPE "ModuleLink" ADD VALUE IF NOT EXISTS 'OFFICE_INCOME';
ALTER TYPE "ModuleLink" ADD VALUE IF NOT EXISTS 'STAFF_PAYROLL';

-- Salary rows gain their own document number and reference. Until now a salary
-- had no number to settle against - the row was identified by employee + month,
-- which is not something a payment voucher can point at.
ALTER TABLE "StaffSalary" ADD COLUMN IF NOT EXISTS "voucherNo" TEXT;
ALTER TABLE "StaffSalary" ADD COLUMN IF NOT EXISTS "refNo" TEXT;
ALTER TABLE "StaffSalary" ADD COLUMN IF NOT EXISTS "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Backfill a number for existing salary rows, oldest first per firm+FY so the
-- sequence matches the order they were entered.
WITH numbered AS (
  SELECT id,
         'PAY-' || lpad(
           row_number() OVER (PARTITION BY "firmId", "fyId" ORDER BY "month", "createdAt")::text,
           4, '0'
         ) AS gen
  FROM "StaffSalary"
  WHERE "voucherNo" IS NULL
)
UPDATE "StaffSalary" s SET "voucherNo" = n.gen FROM numbered n WHERE s.id = n.id;

-- A salary already marked PAID has been settled in full from its own screen.
-- Recording that as paidAmount is what stops it reappearing as outstanding in
-- the payment voucher the moment this ships.
UPDATE "StaffSalary" SET "paidAmount" = "netSalary" WHERE "paymentStatus" = 'PAID';

-- Blank reference means "use the voucher number", so make that concrete rather
-- than deriving it in every reader.
UPDATE "StaffSalary" SET "refNo" = "voucherNo" WHERE "refNo" IS NULL;
UPDATE "OfficeTransaction" SET "refNo" = "voucherNo" WHERE "refNo" IS NULL OR btrim("refNo") = '';
