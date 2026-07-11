-- Row Level Security: every tenant-scoped table is protected by a policy
-- keyed on the per-transaction setting app.tenant_id. The application data
-- layer (src/lib/db.ts) sets this inside a transaction for every request.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE column_name = 'tenantId' AND table_schema = 'public'
    GROUP BY table_name
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))',
      t
    );
    -- allow platform-level operations (signup, login before tenant known)
    EXECUTE format(
      'CREATE POLICY platform_bypass ON %I USING (current_setting(''app.bypass_rls'', true) = ''on'') WITH CHECK (current_setting(''app.bypass_rls'', true) = ''on'')',
      t
    );
  END LOOP;
END $$;

-- Tenant table itself: readable when bypass is on or it is the current tenant
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_self ON "Tenant"
  USING (id = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (id = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');
