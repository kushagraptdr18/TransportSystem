-- One POD per LR: concurrent batch saves must not create duplicates.
-- (lrId is nullable; multiple NULLs remain allowed by Postgres.)
CREATE UNIQUE INDEX IF NOT EXISTS "Pod_lrId_key" ON "Pod"("lrId");
