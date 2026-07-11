-- Non-superuser role for the application. RLS applies to this role;
-- the container superuser (tms) is only used for migrations/seed.
-- On managed hosts (e.g. Render) CREATEROLE may be unavailable; the whole
-- block then no-ops and the app connects as the database owner instead,
-- which is safe because every policy uses FORCE ROW LEVEL SECURITY.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_dev_password';
  END IF;

  GRANT USAGE ON SCHEMA public TO app_user;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'app_user role not created (insufficient privilege); skipping';
END $$;
