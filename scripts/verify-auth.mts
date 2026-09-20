/**
 * Production auth preflight.
 *
 * Point this at the connection string you intend to deploy with and it
 * will tell you, before you deploy, whether authentication can work
 * there:
 *
 *   npm run verify:auth
 *
 * It reports the *shape* of the configuration — never a credential — and
 * then exercises the real flow end to end: create a user, verify the
 * password, mint a session row, sign and verify the JWT, look the
 * session back up, and delete everything it created.
 *
 * What it cannot cover is the cookie write itself, which only exists
 * inside a request. Everything the cookie depends on is covered.
 */
import { config } from 'dotenv';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { promises as dns } from 'node:dns';

config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

/*
 * Expand `${VAR}` references the way Prisma's own dotenv layer does, so
 * a .env that defines DIRECT_URL="${DATABASE_URL}" reads here exactly as
 * the Prisma CLI reads it. Plain dotenv leaves the literal text.
 */
for (const [key, value] of Object.entries(process.env)) {
  if (typeof value === 'string' && value.includes('${')) {
    process.env[key] = value.replace(
      /\$\{([A-Z0-9_]+)\}/gi,
      (whole, name: string) => process.env[name] ?? whole
    );
  }
}

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const amber = (s: string) => `\x1b[33m${s}\x1b[0m`;

let failures = 0;
let warnings = 0;

function ok(label: string, detail = '') {
  console.log(`  ${green('ok')}    ${label}${detail ? `\n        ${detail}` : ''}`);
}
function bad(label: string, detail = '') {
  failures++;
  console.log(`  ${red('FAIL')}  ${label}${detail ? `\n        ${detail}` : ''}`);
}
function warn(label: string, detail = '') {
  warnings++;
  console.log(`  ${amber('warn')}  ${label}${detail ? `\n        ${detail}` : ''}`);
}

interface UrlShape {
  host: string;
  port: string;
  query: string;
}

/** Parses a connection string for its shape only. Credentials are dropped. */
function shapeOf(raw: string | undefined): UrlShape | null {
  if (!raw) return null;
  // Positional groups rather than named ones: the project targets ES2017.
  const m = raw.match(/^\w+:\/\/[^:]*:[^@]*@([^:/?]+)(?::(\d+))?(?:\/[^?]*)?(?:\?(.*))?/);
  if (!m) return null;
  return { host: m[1], port: m[2] ?? '5432', query: m[3] ?? '' };
}

function maskHost(host: string): string {
  const parts = host.split('.');
  if (parts.length < 3) return host;
  return `${parts[0]}.…${parts.slice(-2).join('.')}`;
}

async function families(host: string): Promise<{ v4: number; v6: number }> {
  const count = async (fn: () => Promise<unknown[]>) => {
    try {
      return (await fn()).length;
    } catch {
      return 0;
    }
  };
  return {
    v4: await count(() => dns.resolve4(host)),
    v6: await count(() => dns.resolve6(host)),
  };
}

async function main() {
  console.log('\nConfiguration');

  /* --- AUTH_SECRET ------------------------------------------------- */
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    bad('AUTH_SECRET is not set', 'In production the app refuses to sign sessions without it.');
  } else if (secret.length < 32) {
    bad(
      `AUTH_SECRET is ${secret.length} characters`,
      'Minimum is 32. Generate one with: openssl rand -base64 32'
    );
  } else {
    ok('AUTH_SECRET', `${secret.length} characters`);
  }

  /* --- App URL ------------------------------------------------------ */
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    warn('NEXT_PUBLIC_APP_URL is not set', 'Verification and reset emails need an absolute URL.');
  } else if (/localhost|127\.0\.0\.1/.test(appUrl)) {
    warn(
      `NEXT_PUBLIC_APP_URL is ${appUrl}`,
      'Correct locally. In Vercel it must be the deployed https:// origin, or emailed ' +
        'verification and password-reset links will point at localhost.'
    );
  } else if (!appUrl.startsWith('https://')) {
    warn(`NEXT_PUBLIC_APP_URL is ${appUrl}`, 'Production should be https://.');
  } else {
    ok('NEXT_PUBLIC_APP_URL', appUrl);
  }

  /* --- Connection strings ------------------------------------------- */
  const runtime = shapeOf(process.env.DATABASE_URL);
  const direct = shapeOf(process.env.DIRECT_URL);

  if (!runtime) {
    bad('DATABASE_URL is not set or unparseable');
  } else {
    const isSupabaseDirect = /^db\..*\.supabase\.co$/.test(runtime.host);
    const isPooler = runtime.host.includes('pooler.supabase.com');
    const fam = await families(runtime.host);

    console.log(
      `\n  DATABASE_URL  host=${maskHost(runtime.host)} port=${runtime.port} ` +
        `dns: IPv4=${fam.v4} IPv6=${fam.v6}`
    );

    if (isSupabaseDirect && fam.v4 === 0) {
      bad(
        'DATABASE_URL points at the Supabase direct host, which is IPv6-only',
        'Vercel serverless functions have no outbound IPv6, so every query fails there\n        ' +
          'with P1001 while working from this machine. Use the Supavisor pooler:\n        ' +
          'aws-<n>-<region>.pooler.supabase.com:6543 with ?pgbouncer=true&connection_limit=1'
      );
    } else if (isPooler) {
      if (runtime.port === '6543' && !runtime.query.includes('pgbouncer=true')) {
        bad(
          'Pooler on port 6543 without ?pgbouncer=true',
          'Transaction-mode pooling breaks prepared statements; Prisma will fail ' +
            'intermittently with P1017.'
        );
      } else if (!runtime.query.includes('connection_limit')) {
        warn(
          'Pooler URL has no connection_limit',
          'Add &connection_limit=1 so each serverless instance holds one connection.'
        );
      } else {
        ok('DATABASE_URL is a pooled, IPv4-reachable connection');
      }
    } else if (fam.v4 === 0 && fam.v6 > 0) {
      warn('DATABASE_URL host resolves over IPv6 only', 'Most serverless platforms cannot reach it.');
    } else {
      ok('DATABASE_URL host is IPv4-reachable');
    }
  }

  if (!direct) {
    bad(
      'DIRECT_URL is not set',
      'The Prisma schema declares directUrl, so `prisma generate`, `db push` and ' +
        'migrations all fail without it — including the Vercel build.'
    );
  } else {
    ok('DIRECT_URL', `host=${maskHost(direct.host)} port=${direct.port}`);
    if (direct.port === '6543') {
      warn(
        'DIRECT_URL uses the transaction pooler port',
        'DDL needs a session connection: use the direct host or the pooler on 5432.'
      );
    }
  }

  /* --- The actual flow ---------------------------------------------- */
  console.log('\nAuthentication flow (against the configured database)');

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const email = `preflight-${Date.now()}@blocklens.invalid`;
  const password = 'Preflight-Password-2026';
  let userId: string | undefined;

  try {
    const t0 = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    ok('database reachable', `round trip ${Date.now() - t0}ms`);

    // 1. Register
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({ data: { email, name: 'Preflight', passwordHash } });
    userId = user.id;
    ok('create user', 'the columns the client selects all exist');

    // 2. Look the user up exactly as the login route does
    const found = await prisma.user.findUnique({ where: { email } });
    if (!found) throw new Error('user lookup returned null immediately after insert');
    ok('user lookup by email');

    // 3. Password verification
    if (!(await bcrypt.compare(password, found.passwordHash))) {
      throw new Error('bcrypt comparison failed against a hash it just produced');
    }
    if (await bcrypt.compare('the-wrong-password', found.passwordHash)) {
      throw new Error('bcrypt accepted a wrong password');
    }
    ok('password verify', 'correct password accepted, wrong password rejected');

    // 4. Session row + JWT, mirroring createSession()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const session = await prisma.session.create({
      data: { userId: user.id, token: crypto.randomUUID(), expiresAt },
    });

    const key = new TextEncoder().encode(secret ?? 'x'.repeat(32));
    const jwt = await new SignJWT({ sessionId: session.id, token: session.token })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .sign(key);
    ok('session created and JWT signed');

    // 5. Verify, mirroring verifySession()
    const { payload } = await jwtVerify(jwt, key);
    const back = await prisma.session.findUnique({
      where: { id: payload.sessionId as string, token: payload.token as string },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    if (!back) throw new Error('session lookup returned null for a session just created');
    if (back.user.email !== email) throw new Error('session resolved to the wrong user');
    ok('JWT verified and session resolved', `back to ${back.user.name}`);

    // 6. Sign out
    await prisma.session.delete({ where: { id: session.id } });
    const gone = await prisma.session.findUnique({ where: { id: session.id } });
    if (gone) throw new Error('session still present after delete');
    ok('sign out revokes the session row');
  } catch (error) {
    const e = error as { code?: string; message?: string };
    bad(
      'flow failed',
      `code=${e.code ?? '(none)'}  ${String(e.message ?? error)
        .split('\n')[0]
        .replace(/postgres(ql)?:\/\/[^\s"]+/gi, '[redacted]')
        .slice(0, 240)}`
    );
  } finally {
    // Only ever removes the throwaway account this script created.
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
      console.log(`  ${green('ok')}    cleaned up the preflight account`);
    }
    await prisma.$disconnect();
  }

  console.log('');
  if (failures > 0) {
    console.log(red(`${failures} blocking issue(s)`) + (warnings ? `, ${warnings} warning(s)` : ''));
    process.exit(1);
  }
  console.log(
    green('Authentication works against this configuration.') +
      (warnings ? ` ${amber(`${warnings} warning(s) above.`)}` : '')
  );
}

void main();
