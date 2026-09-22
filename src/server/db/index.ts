import 'server-only';

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * The Prisma client, over the `pg` driver adapter.
 *
 * Measured, not assumed: with the engine's own connector and
 * `?pgbouncer=true` (required for Supavisor's transaction pooler), Prisma
 * wraps every statement in BEGIN / DEALLOCATE ALL / query / COMMIT — four
 * network round trips per query — and `connection_limit=1` made every
 * `Promise.all` run serially. A page with six queries spent ~2s on the
 * network. The `pg` adapter sends each parameterised query as a single
 * round trip using unnamed statements, which the transaction pooler
 * supports, and a small pool lets independent queries run concurrently.
 * Transaction pooling is kept, so serverless instances still cannot
 * exhaust the database's connection slots.
 *
 * TLS: encrypted without certificate verification, the same as the
 * engine's default `sslmode=prefer` this replaces. Supabase's CA is not in
 * Node's trust store.
 */

const POOL_SIZE = 5;

/** The URL `pg` understands: Prisma-only parameters removed. */
function connectionString(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is not set');
  const url = new URL(raw);
  for (const key of ['pgbouncer', 'connection_limit', 'pool_timeout', 'schema', 'sslmode', 'statement_cache_size']) {
    url.searchParams.delete(key);
  }
  return url.toString();
}

function create() {
  const adapter = new PrismaPg({
    connectionString: connectionString(),
    max: POOL_SIZE,
    ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '') ? false : { rejectUnauthorized: false },
    // Reconnecting costs a TLS handshake (~0.5s measured); keep warm connections
    // across the gaps between a person's page views.
    idleTimeoutMillis: 5 * 60_000,
    connectionTimeoutMillis: 10_000,
  });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

const globalForPrisma = globalThis as unknown as { prisma: ReturnType<typeof create> | undefined };

export const prisma = globalForPrisma.prisma ?? create();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
