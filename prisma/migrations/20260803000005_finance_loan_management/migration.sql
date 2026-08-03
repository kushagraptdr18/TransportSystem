-- Finance & Loan Management: loans, their instalments, and non-operational
-- money movement. All of it posts through the existing voucher + ledger engine;
-- these tables only hold the loan's own state.

CREATE TABLE IF NOT EXISTS "Loan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "loanNo" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "partyId" TEXT NOT NULL,
    "loanType" TEXT NOT NULL,
    "purpose" TEXT,
    "vehicleId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "interestMode" TEXT NOT NULL DEFAULT 'NONE',
    "interestRate" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "emiApplicable" BOOLEAN NOT NULL DEFAULT false,
    "emiAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "emiStartDate" TIMESTAMP(3),
    "emiFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "tenureMonths" INTEGER NOT NULL DEFAULT 0,
    "tdsApplicable" BOOLEAN NOT NULL DEFAULT false,
    "tdsPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "closedDate" TIMESTAMP(3),
    "remarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Loan_firmId_fyId_loanNo_key" ON "Loan" ("firmId", "fyId", "loanNo");
CREATE INDEX IF NOT EXISTS "Loan_tenantId_firmId_fyId_status_idx" ON "Loan" ("tenantId", "firmId", "fyId", "status");
CREATE INDEX IF NOT EXISTS "Loan_tenantId_vehicleId_idx" ON "Loan" ("tenantId", "vehicleId");

CREATE TABLE IF NOT EXISTS "LoanEmi" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "emiNo" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3),
    "payDate" TIMESTAMP(3) NOT NULL,
    "principal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "interest" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "penalty" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tdsAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "isSettlement" BOOLEAN NOT NULL DEFAULT false,
    "bankPartyId" TEXT NOT NULL,
    "voucherId" TEXT,
    "voucherNo" TEXT,
    "remarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "LoanEmi_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LoanEmi_tenantId_loanId_payDate_idx" ON "LoanEmi" ("tenantId", "loanId", "payDate");
CREATE INDEX IF NOT EXISTS "LoanEmi_tenantId_firmId_fyId_payDate_idx" ON "LoanEmi" ("tenantId", "firmId", "fyId", "payDate");

ALTER TABLE "LoanEmi" DROP CONSTRAINT IF EXISTS "LoanEmi_loanId_fkey";
ALTER TABLE "LoanEmi" ADD CONSTRAINT "LoanEmi_loanId_fkey"
    FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "FinanceTxn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "voucherNo" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "direction" TEXT NOT NULL,
    "txnType" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "entryType" TEXT NOT NULL DEFAULT 'CASH',
    "bankPartyId" TEXT NOT NULL,
    "voucherId" TEXT,
    "remarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "FinanceTxn_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FinanceTxn_firmId_fyId_voucherNo_key" ON "FinanceTxn" ("firmId", "fyId", "voucherNo");
CREATE INDEX IF NOT EXISTS "FinanceTxn_tenantId_firmId_fyId_date_idx" ON "FinanceTxn" ("tenantId", "firmId", "fyId", "date");
