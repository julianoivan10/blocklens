/**
 * Read-only production-safety inspection.
 *
 * Compares the columns the Prisma schema expects against the columns the
 * connected database actually has, and reports connectivity facts. Runs
 * only SELECTs against the catalog — it writes nothing, creates nothing
 * and drops nothing. No credential is ever printed.
 */
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

/** What the schema declares, table -> columns (snake-mapped names). */
const EXPECTED: Record<string, string[]> = {
  users: [
    'id', 'email', 'name', 'passwordHash', 'emailVerified', 'verificationToken',
    'verificationTokenExpiry', 'resetToken', 'resetTokenExpiry', 'image',
    'createdAt', 'updatedAt',
  ],
  sessions: ['id', 'userId', 'token', 'expiresAt', 'createdAt'],
  watchlists: ['id', 'name', 'userId', 'createdAt', 'updatedAt'],
  watchlist_items: ['id', 'watchlistId', 'symbol', 'name', 'addedAt'],
  research_history: ['id', 'userId', 'symbol', 'name', 'viewedAt'],
  saved_research: ['id', 'userId', 'symbol', 'name', 'data', 'notes', 'savedAt', 'updatedAt'],
};

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

try {
  const t0 = Date.now();
  const version = await prisma.$queryRaw<Array<{ v: string }>>`SELECT version() AS v`;
  console.log(`\nconnected in ${Date.now() - t0}ms`);
  console.log(`server: ${version[0].v.split(' ').slice(0, 2).join(' ')}`);

  const rows = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `;

  const actual = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!actual.has(r.table_name)) actual.set(r.table_name, new Set());
    actual.get(r.table_name)!.add(r.column_name);
  }

  console.log('\nschema comparison (Prisma schema vs connected database):');
  let drift = 0;

  for (const [table, columns] of Object.entries(EXPECTED)) {
    const have = actual.get(table);
    if (!have) {
      drift++;
      console.log(`  ${red('MISSING TABLE')}  ${table}`);
      continue;
    }
    const missing = columns.filter((c) => !have.has(c));
    if (missing.length === 0) {
      console.log(`  ${green('ok')}            ${table} (${have.size} columns)`);
    } else {
      drift++;
      console.log(`  ${red('DRIFT')}         ${table} — missing: ${missing.join(', ')}`);
    }
  }

  // Row counts confirm whether this is the database holding real accounts.
  const users = await prisma.user.count();
  const sessions = await prisma.session.count();
  console.log(`\nrows: users=${users} sessions=${sessions}`);

  console.log(
    drift === 0
      ? `\n${green('No schema drift: every column the Prisma client selects exists.')}\n`
      : `\n${red(`${drift} table(s) drifted — Prisma will error on any query touching them.`)}\n`
  );
} catch (error) {
  const e = error as { code?: string; message?: string };
  console.log(`\n${red('CONNECTION OR QUERY FAILED')}`);
  console.log(`  code   : ${e.code ?? '(none)'}`);
  // Strip anything that could carry credentials out of the message.
  console.log(`  message: ${(e.message ?? String(error)).split('\n').slice(0, 6).join('\n           ').replace(/postgres(ql)?:\/\/[^\s"]+/gi, '[redacted]')}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
