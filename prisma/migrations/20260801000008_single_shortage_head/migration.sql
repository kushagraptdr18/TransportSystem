-- Collapse the four shortage ledgers into one.
-- Chalan used "Shortage Recovered", the broker slip used that plus "Shortage
-- Allowed", and the driver modules used "Shortage Recovery (Driver)". A single
-- "Shortage" head now carries all of it: charged debits it, recovered credits
-- it, so its balance is the net unrecovered shortage across every module.

-- 1. make sure the target head exists, per tenant that had any old head
INSERT INTO "AccountHead" ("id", "tenantId", "name", "kind")
SELECT gen_random_uuid()::text, h."tenantId", 'Shortage', 'EXPENSE'
FROM (SELECT DISTINCT "tenantId" FROM "AccountHead"
      WHERE "name" IN ('Shortage Recovered', 'Shortage Allowed', 'Shortage Recovery (Driver)')) h
WHERE NOT EXISTS (
  SELECT 1 FROM "AccountHead" x WHERE x."tenantId" = h."tenantId" AND x."name" = 'Shortage'
);

-- 2. repoint every ledger row written against an old head
UPDATE "LedgerEntry" le
SET "accountHeadId" = tgt."id"
FROM "AccountHead" old
JOIN "AccountHead" tgt ON tgt."tenantId" = old."tenantId" AND tgt."name" = 'Shortage'
WHERE le."accountHeadId" = old."id"
  AND old."name" IN ('Shortage Recovered', 'Shortage Allowed', 'Shortage Recovery (Driver)');

-- 3. drop the now-empty old heads
DELETE FROM "AccountHead"
WHERE "name" IN ('Shortage Recovered', 'Shortage Allowed', 'Shortage Recovery (Driver)')
  AND NOT EXISTS (SELECT 1 FROM "LedgerEntry" le WHERE le."accountHeadId" = "AccountHead"."id");
