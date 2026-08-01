-- An advance adjustment is a reference link, not a financial transaction: the
-- advance voucher already debited the party. The first cut of the feature also
-- posted an ADVANCE_ADJUSTMENT pair, which double-counted the party's debit and
-- inflated the ledger totals and running balance. Remove those rows.
DELETE FROM "LedgerEntry" WHERE "refType" = 'ADVANCE_ADJUSTMENT';
