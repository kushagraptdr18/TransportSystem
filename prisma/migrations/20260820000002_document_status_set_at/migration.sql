-- Auto DONE->PENDING flip: only an EXPLICIT status action (status board /
-- bulk update) should protect a DONE inside the reminder window. updatedAt
-- moved on every edit and blocked freshly-created documents from flipping.
ALTER TABLE "VehicleDocument" ADD COLUMN IF NOT EXISTS "statusSetAt" TIMESTAMP(3);
