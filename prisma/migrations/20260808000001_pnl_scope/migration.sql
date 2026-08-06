-- P&L Head Mapping: which operational P&L a ledger head reports in.
-- AUTO keeps today's module-wise behaviour.
ALTER TABLE "AccountHead" ADD COLUMN IF NOT EXISTS "pnlScope" TEXT NOT NULL DEFAULT 'AUTO';
