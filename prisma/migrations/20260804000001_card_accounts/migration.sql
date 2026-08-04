-- Card accounts (fuel / fleet cards) behave exactly like bank accounts:
-- same master, same vouchers, same books. Only the enum values are new —
-- no table changes, no data migration.

ALTER TYPE "LedgerGroup" ADD VALUE IF NOT EXISTS 'CARD';
ALTER TYPE "VoucherEntryType" ADD VALUE IF NOT EXISTS 'CARD';
