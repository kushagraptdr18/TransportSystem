-- One register for every shortage in the system. A shortage becomes a document
-- with its own outstanding, and every recovery links back to it, so "created vs
-- recovered vs pending" is answerable in one place instead of being a loose
-- number netted off half a dozen other documents.

CREATE TABLE "ShortageEntry" (
  "id"              TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  "firmId"          TEXT NOT NULL,
  "fyId"            TEXT NOT NULL,
  "date"            TIMESTAMP(3) NOT NULL,
  "module"          TEXT NOT NULL,
  "refId"           TEXT,
  "refNo"           TEXT NOT NULL,
  "partyId"         TEXT,
  "driverId"        TEXT,
  "partyKind"       TEXT NOT NULL,
  "amount"          DECIMAL(14,2) NOT NULL DEFAULT 0,
  "recoveredAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "remarks"         TEXT,
  "createdById"     TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  "deletedAt"       TIMESTAMP(3),
  CONSTRAINT "ShortageEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShortageEntry_tenantId_firmId_fyId_idx" ON "ShortageEntry"("tenantId","firmId","fyId");
CREATE INDEX "ShortageEntry_tenantId_partyId_idx"     ON "ShortageEntry"("tenantId","partyId");
CREATE INDEX "ShortageEntry_tenantId_driverId_idx"    ON "ShortageEntry"("tenantId","driverId");
CREATE INDEX "ShortageEntry_tenantId_module_refId_idx" ON "ShortageEntry"("tenantId","module","refId");

CREATE TABLE "ShortageRecovery" (
  "id"         TEXT NOT NULL,
  "tenantId"   TEXT NOT NULL,
  "shortageId" TEXT NOT NULL,
  "date"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "module"     TEXT NOT NULL,
  "refId"      TEXT NOT NULL,
  "refNo"      TEXT NOT NULL,
  "source"     TEXT NOT NULL,
  "amount"     DECIMAL(14,2) NOT NULL DEFAULT 0,
  "remarks"    TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShortageRecovery_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShortageRecovery_tenantId_module_refId_idx" ON "ShortageRecovery"("tenantId","module","refId");
CREATE INDEX "ShortageRecovery_shortageId_idx" ON "ShortageRecovery"("shortageId");
ALTER TABLE "ShortageRecovery" ADD CONSTRAINT "ShortageRecovery_shortageId_fkey"
  FOREIGN KEY ("shortageId") REFERENCES "ShortageEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
