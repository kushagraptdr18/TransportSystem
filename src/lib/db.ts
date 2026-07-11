import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Tx = Prisma.TransactionClient;

// Serverless Postgres (Neon) cold-starts can take several seconds, and the
// dashboard runs ~25 queries per transaction — Prisma's 5s default expired
// them in production (P2028). maxWait covers waiting for a pooled connection.
const TX_OPTIONS = { maxWait: 20_000, timeout: 60_000 } as const;

/**
 * Run `fn` inside a transaction with RLS scoped to the given tenant.
 * All table access inside is restricted by the tenant_isolation policy.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: Tx) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.tenant_id', '${tenantId.replace(/'/g, "")}', true)`
    );
    return fn(tx);
  }, TX_OPTIONS);
}

/**
 * Platform-level access (signup, login before tenant resolution).
 * Bypasses tenant RLS inside a transaction.
 */
export async function withPlatform<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.bypass_rls', 'on', true)`);
    return fn(tx);
  }, TX_OPTIONS);
}
