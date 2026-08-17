-- One F&F per driver, ever: two concurrent finalizations both passed the
-- findFirst existence check — the database now rejects the second (P2002).
CREATE UNIQUE INDEX IF NOT EXISTS "DriverFnf_driverId_key" ON "DriverFnf"("driverId");
