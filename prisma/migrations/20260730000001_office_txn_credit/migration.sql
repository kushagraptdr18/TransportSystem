-- Office income/expense on credit: payment mode + cash/bank account become
-- optional. Blank payment mode = outstanding on the supplier/party ledger,
-- settled later through a payment/receipt voucher.
ALTER TABLE "OfficeTransaction"
  ALTER COLUMN "paymentMode" DROP NOT NULL,
  ALTER COLUMN "paymentMode" DROP DEFAULT,
  ALTER COLUMN "bankPartyId" DROP NOT NULL;
