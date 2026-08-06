-- updatedAt on VehicleDocument: the status board flips DONE->PENDING only for
-- marks made BEFORE the document entered its reminder window.
ALTER TABLE "VehicleDocument" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
