-- Document Master now defines each document's validity period in days
ALTER TABLE "DocumentType" ADD COLUMN "expiryDays" INTEGER NOT NULL DEFAULT 365;
