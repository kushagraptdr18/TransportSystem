-- Per-reference round-off on a voucher allocation, so settling a chalan or
-- broker slip from the Payment Voucher can round the payable exactly like the
-- document's own balance-payment screen does. May be negative (paid extra).
ALTER TABLE "VoucherAllocation" ADD COLUMN "roundOff" DECIMAL(12,2) NOT NULL DEFAULT 0;
