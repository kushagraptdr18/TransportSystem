-- Document Master no longer carries "document valid for this many days"; the
-- expiry date is entered on each vehicle document instead.
ALTER TABLE "DocumentType" DROP COLUMN "expiryDays";
