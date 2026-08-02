-- Trip Sheet: "Actual Income - Actual Expenses" calculation method.
--
-- The method reuses roadBillExp / foodingDays / foodingRate / rtoExp, which
-- already exist for the approved side. These three cover what it adds: the two
-- remaining operating-expense heads, and a snapshot of the operating expenses
-- fetched automatically from the vehicle expense register.
--
-- calcMethod stays a String column - "ACTUAL" is simply a third accepted value,
-- so DIESEL_AVG and FIXED sheets are untouched by this migration.

ALTER TABLE "Trip" ADD COLUMN "roadExp" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN "otherOpExp" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN "autoFetchedExp" DECIMAL(14,2) NOT NULL DEFAULT 0;
