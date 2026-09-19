import 'server-only';

/**
 * The JWT signing key.
 *
 * Previously both `middleware.ts` and `session.ts` fell back to a
 * hardcoded literal when `AUTH_SECRET` was unset, which means a
 * production deploy missing the variable would sign sessions with a
 * publicly known key and never say so. This fails loudly instead.
 *
 * Resolved lazily rather than at module load so a build without the
 * variable present still succeeds; the error surfaces on first use.
 * Edge-safe — no Node built-ins.
 */

const DEV_FALLBACK = 'blocklens-development-only-secret-do-not-use-in-production';
const MIN_LENGTH = 32;

let cached: Uint8Array | null = null;
let warned = false;

export function getAuthSecret(): Uint8Array {
  if (cached) return cached;

  const raw = process.env.AUTH_SECRET;

  if (!raw || raw.length < MIN_LENGTH) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `AUTH_SECRET is ${!raw ? 'not set' : `shorter than ${MIN_LENGTH} characters`}. ` +
          'Generate one with `openssl rand -base64 32` and set it before deploying.'
      );
    }
    if (!warned) {
      warned = true;
      console.warn(
        `[auth] AUTH_SECRET is ${!raw ? 'missing' : 'too short'}; using a development ` +
          'fallback key. Sessions signed with it are not secure.'
      );
    }
    cached = new TextEncoder().encode(DEV_FALLBACK);
    return cached;
  }

  cached = new TextEncoder().encode(raw);
  return cached;
}
