-- Bill Submission v2: multi-invoice submissions with covering letter,
-- acknowledgement, uploads and automatic returned/resubmitted tracking.
CREATE TABLE "InvoiceSubmission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "submissionNo" TEXT NOT NULL,
    "submissionDate" TIMESTAMP(3) NOT NULL,
    "partyId" TEXT NOT NULL,
    "remarks" TEXT,
    "receivedBy" TEXT,
    "designation" TEXT,
    "receiverMobile" TEXT,
    "receivedDate" TIMESTAMP(3),
    "receivedTime" TEXT,
    "ackRemarks" TEXT,
    "signedLetterPath" TEXT,
    "ackCopyPath" TEXT,
    "supportingPath" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InvoiceSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceSubmissionItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "resubmittedInId" TEXT,
    "resubmittedInNo" TEXT,
    "resubmissionDate" TIMESTAMP(3),
    CONSTRAINT "InvoiceSubmissionItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvoiceSubmission_firmId_fyId_submissionNo_key"
    ON "InvoiceSubmission"("firmId", "fyId", "submissionNo");
CREATE INDEX "InvoiceSubmission_tenantId_firmId_fyId_partyId_idx"
    ON "InvoiceSubmission"("tenantId", "firmId", "fyId", "partyId");
CREATE UNIQUE INDEX "InvoiceSubmissionItem_submissionId_invoiceId_key"
    ON "InvoiceSubmissionItem"("submissionId", "invoiceId");
CREATE INDEX "InvoiceSubmissionItem_tenantId_invoiceId_idx"
    ON "InvoiceSubmissionItem"("tenantId", "invoiceId");

ALTER TABLE "InvoiceSubmissionItem" ADD CONSTRAINT "InvoiceSubmissionItem_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "InvoiceSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceSubmissionItem" ADD CONSTRAINT "InvoiceSubmissionItem_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS (same policies as all tenant-scoped tables)
ALTER TABLE "InvoiceSubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceSubmission" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "InvoiceSubmission"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
CREATE POLICY platform_bypass ON "InvoiceSubmission"
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "InvoiceSubmissionItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceSubmissionItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "InvoiceSubmissionItem"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
CREATE POLICY platform_bypass ON "InvoiceSubmissionItem"
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');
