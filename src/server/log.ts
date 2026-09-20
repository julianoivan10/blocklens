import 'server-only';

/**
 * Structured server-side error logging.
 *
 * The user-facing message for an auth failure stays deliberately vague —
 * telling an anonymous caller *why* a login failed is how account
 * enumeration starts. But the server log has to be specific enough to
 * diagnose a production incident without a debugger, which is exactly
 * what was missing when database connectivity broke after deploy: the
 * real error went to `console.error` as an opaque object and the
 * operator saw only "An unexpected error occurred".
 *
 * Two things this module learned from being tested against a real
 * failure rather than assumed:
 *
 *  - A Prisma connection failure caused by DNS carries **no** error code
 *    at all — `code` and `errorCode` are both undefined. Matching on the
 *    code alone would have missed the one case this exists for, so the
 *    message is pattern-matched as well.
 *
 *  - The connection string, password included, appears in both the
 *    message and the stack. Every string emitted here is scrubbed, not
 *    just the one that looked risky.
 */

/** Prisma error codes worth translating into an operator instruction. */
const CODE_HINTS: Record<string, string> = {
  P1000: 'Database authentication failed — check the credentials in DATABASE_URL.',
  P1001: UNREACHABLE_HINT(),
  P1002: 'Database reachable but timed out on connect — check pooler health and connection_limit.',
  P1008: 'Operation timed out — likely connection-pool starvation; set connection_limit=1 on the pooler URL.',
  P1010: 'The database user was denied access to the database.',
  P1017: 'The server closed the connection — typical of a pooler used without ?pgbouncer=true.',
  P2021: 'A table does not exist in this database. The schema was never pushed or migrated here.',
  P2022: 'A column does not exist in this database. The schema drifted from the Prisma schema.',
  P2002: 'Unique constraint violation.',
  P2025: 'Record required by the operation was not found.',
};

function UNREACHABLE_HINT(): string {
  return (
    'Database unreachable. On Vercel this is almost always DATABASE_URL pointing at ' +
    'db.<ref>.supabase.co, which publishes only an AAAA record; serverless functions ' +
    'have no outbound IPv6. Use the Supavisor pooler host ' +
    '(aws-<n>-<region>.pooler.supabase.com:6543) with ?pgbouncer=true&connection_limit=1. ' +
    'Run `npm run verify:auth` against the deployed connection string to confirm.'
  );
}

/** Failures that carry no code but are unmistakable from their text. */
const MESSAGE_HINTS: Array<[RegExp, string]> = [
  [/can'?t reach database server|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|getaddrinfo/i, UNREACHABLE_HINT()],
  [
    /Environment variable not found: DIRECT_URL/i,
    'DIRECT_URL is not set. The schema declares directUrl, so `prisma generate` and the ' +
      'build fail without it. Set it in Vercel as a literal connection string.',
  ],
  [
    /Environment variable not found: DATABASE_URL/i,
    'DATABASE_URL is not set in this environment.',
  ],
  [
    /prepared statement .* already exists/i,
    'Transaction-mode pooling without ?pgbouncer=true on the connection string.',
  ],
  [
    /AUTH_SECRET is (not set|shorter)/i,
    'AUTH_SECRET is missing or under 32 characters in this environment. Sessions cannot be signed.',
  ],
  [
    /did not initialize yet|@prisma\/client did not initialize/i,
    'The Prisma client was never generated for this build. `prisma generate` runs as part ' +
      'of the build script — check it was not skipped by a cached install.',
  ],
];

/**
 * Removes anything credential-shaped from a string before it is written.
 *
 * Applied to every emitted value, because connection strings turn up in
 * driver messages and in stack frames that quote source lines.
 */
function scrub(input: unknown): string {
  return String(input ?? '')
    .replace(/\b[a-z]+:\/\/[^\s"'`)]*:[^\s"'`)@]*@/gi, (m) => `${m.split('://')[0]}://[redacted]@`)
    .replace(/(password\s*[=:]\s*)["']?[^\s&"'`,)]+/gi, '$1[redacted]')
    .replace(/\b(AUTH_SECRET|API_KEY|apikey|authorization|bearer)\b(\s*[=:]\s*)\S+/gi, '$1$2[redacted]');
}

/** First line with actual content — Prisma messages often start blank. */
function firstMeaningfulLine(message: string): string {
  const line = message
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return (line ?? '(no message)').slice(0, 300);
}

interface ErrorShape {
  code?: string;
  errorCode?: string;
  name?: string;
  message?: string;
  stack?: string;
}

/**
 * Logs one structured line for a server-side failure, plus an operator
 * hint when the failure is one we recognise.
 *
 * Returns the resolved error code, if any, so a caller can correlate its
 * generic response with this entry. It is never sent to the client.
 */
export function logServerError(scope: string, error: unknown): string | undefined {
  const e = (error ?? {}) as ErrorShape;

  const rawMessage = scrub(e.message ?? error);
  // Prisma uses `code` for request errors and `errorCode` for
  // initialization errors — and neither for DNS failures, where the
  // code has to come out of the text if it is there at all.
  const code = e.code ?? e.errorCode ?? rawMessage.match(/\bP\d{4}\b/)?.[0];
  const name = e.name ?? (error instanceof Error ? error.constructor.name : typeof error);

  console.error(
    [`[${scope}]`, `name=${name}`, code ? `code=${code}` : undefined, `message=${firstMeaningfulLine(rawMessage)}`]
      .filter(Boolean)
      .join(' ')
  );

  const hint =
    (code ? CODE_HINTS[code] : undefined) ??
    MESSAGE_HINTS.find(([pattern]) => pattern.test(rawMessage))?.[1];

  if (hint) console.error(`[${scope}] hint: ${hint}`);

  // A stack only helps for genuine programming errors, and only scrubbed:
  // frames quote source lines, which can contain a connection string.
  if (!code && !hint && e.stack) {
    console.error(scrub(e.stack).split('\n').slice(0, 5).join('\n'));
  }

  return code;
}
