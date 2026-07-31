-- Manual advance adjustment in the chalan module (part 1: enum value).
-- ALTER TYPE ... ADD VALUE must not share a transaction with statements that
-- use the new label, so it lives in its own migration.
ALTER TYPE "AdvanceType" ADD VALUE IF NOT EXISTS 'ADVANCE_ADJ';
