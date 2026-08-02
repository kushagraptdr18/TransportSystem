-- Firm logo & seal move from the filesystem into the database.
--
-- The bytes were being written to UPLOAD_DIR and only the path stored here. The
-- host has no persistent volume, so those files vanish on every redeploy while
-- the row keeps pointing at them - the images 404 and have to be re-uploaded
-- after each deploy, forever.
--
-- logoPath / sealPath are deliberately NOT dropped. Existing rows still carry
-- them, and the serving route falls back to reading the file when a row has a
-- path but no bytes, so anything that did survive keeps working until it is
-- re-uploaded. Nothing can be backfilled here: the files this migration would
-- need are, by definition, the ones already gone.

ALTER TABLE "Firm" ADD COLUMN "logoData" BYTEA;
ALTER TABLE "Firm" ADD COLUMN "logoMime" TEXT;
ALTER TABLE "Firm" ADD COLUMN "sealData" BYTEA;
ALTER TABLE "Firm" ADD COLUMN "sealMime" TEXT;
ALTER TABLE "Firm" ADD COLUMN "brandingVersion" INTEGER NOT NULL DEFAULT 0;
