-- Vehicle expense allocation: a purchase no longer has to name a vehicle.
--
-- Tyres, chains, batteries and spares are bought in bulk and fitted later. The
-- purchase is booked once (expense head Dr / supplier Cr) and stays UNALLOCATED
-- until vehicles consume it; allocating moves cost between vehicle registers and
-- posts nothing to the ledger, so no accounting is ever duplicated.

-- what was bought, for allocation by quantity
ALTER TABLE "VehicleExpenseVoucher" ADD COLUMN IF NOT EXISTS "itemName" TEXT;
ALTER TABLE "VehicleExpenseVoucher" ADD COLUMN IF NOT EXISTS "qty" DECIMAL(12,3);

-- Every vehicle-cost report reads the ALLOCATION date rather than the purchase
-- date, so a chain bought on the 1st and fitted on the 8th hits that vehicle's
-- P&L on the 8th.
ALTER TABLE "VehicleExpenseItem" ADD COLUMN IF NOT EXISTS "allocDate" TIMESTAMP(3);
ALTER TABLE "VehicleExpenseItem" ADD COLUMN IF NOT EXISTS "qty" DECIMAL(12,3);
ALTER TABLE "VehicleExpenseItem" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "VehicleExpenseItem" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- existing splits were made at purchase time, so that IS their allocation date
UPDATE "VehicleExpenseItem" i
   SET "allocDate" = v."date"
  FROM "VehicleExpenseVoucher" v
 WHERE i."voucherId" = v."id" AND i."allocDate" IS NULL;

ALTER TABLE "VehicleExpenseItem" ALTER COLUMN "allocDate" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "VehicleExpenseItem_tenantId_allocDate_idx"
    ON "VehicleExpenseItem" ("tenantId", "allocDate");
