-- Chalan carries its own editable Transport Name / Owner Name (prefilled from the broker party)
ALTER TABLE "Chalan" ADD COLUMN "transportName" TEXT;
ALTER TABLE "Chalan" ADD COLUMN "ownerName" TEXT;
