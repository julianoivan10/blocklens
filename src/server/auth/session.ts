import 'server-only';

import { cache } from 'react';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/server/db';
import { AUTH_COOKIE_NAME, AUTH_COOKIE_MAX_AGE, SESSION_EXPIRY_DAYS } from '@/lib/constants';
import { getAuthSecret } from './secret';
import { logServerError } from '@/server/log';
import type { SessionUser } from '@/types';

export async function createSession(userId: string): Promise<string> {
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  // Create session in database
  const session = await prisma.session.create({
    data: {
      userId,
      token: crypto.randomUUID(),
      expiresAt,
    },
  });

  // Create JWT containing the session token
  const jwt = await new SignJWT({ sessionId: session.id, token: session.token })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getAuthSecret());

  // Set cookie
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE,
  });

  return jwt;
}

/**
 * The signed-in user, or null. Memoised per request: the layout, the page
 * and several panels all ask, and each ask used to be two database round
 * trips.
 */
export const verifySession = cache(readSession);

async function readSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const jwt = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!jwt) return null;

  /*
   * Two failures are possible here and they are not the same thing.
   *
   * A cookie that is missing, malformed, expired or signed with a
   * different key means "not signed in" — return null and let the caller
   * send them to the login page. That is normal.
   *
   * A database that cannot be reached does NOT mean "not signed in". The
   * previous blanket catch reported it as such, which turned an outage
   * into an infinite redirect: the proxy checks only the JWT signature,
   * so it waved a valid session through to /dashboard, the page then
   * read null here and bounced to /login, and the proxy bounced it
   * straight back. Infrastructure failures are logged and rethrown so
   * they surface as an error instead of a loop.
   */
  let sessionId: string;
  let token: string;

  try {
    const { payload } = await jwtVerify(jwt, getAuthSecret());
    sessionId = payload.sessionId as string;
    token = payload.token as string;
  } catch {
    return null;
  }

  if (!sessionId || !token) return null;

  // One round trip: the user whose live session matches both the id and
  // the token. Expiry is part of the predicate, so an expired session reads
  // exactly like a missing one.
  const user = await prisma.user.findFirst({
    where: { sessions: { some: { id: sessionId, token, expiresAt: { gt: new Date() } } } },
    select: { id: true, email: true, name: true },
  });

  if (!user) {
    // Best effort, off the hot path: reap the row if it merely expired.
    // Failing to reap must not stop us reporting the caller signed out.
    await prisma.session
      .deleteMany({ where: { id: sessionId, expiresAt: { lte: new Date() } } })
      .catch((error) => logServerError('auth:session-reap', error));
    return null;
  }

  return { id: user.id, email: user.email, name: user.name };
}

/**
 * The signed-in user for a protected server component, or a redirect.
 *
 * A plain `redirect('/login')` here used to loop. The proxy only checks
 * the JWT signature, so a cookie whose database session had been revoked
 * (password reset, "sign out everywhere", expiry) still looked signed in
 * there: /login was bounced back to /dashboard and the person could never
 * reach the form. The expired route clears the stale cookie first, which
 * breaks the cycle.
 */
export async function requireUser(callbackPath: string): Promise<SessionUser> {
  const user = await verifySession();
  if (user) return user;

  const params = new URLSearchParams({ callbackUrl: callbackPath });
  redirect(`/api/auth/expired?${params}`);
}

export async function destroySession(): Promise<void> {
  try {
    const cookieStore = await cookies();
    const jwt = cookieStore.get(AUTH_COOKIE_NAME)?.value;
    if (jwt) {
      try {
        const { payload } = await jwtVerify(jwt, getAuthSecret());
        const sessionId = payload.sessionId as string;
        if (sessionId) {
          await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
        }
      } catch {
        // Invalid JWT, just clear the cookie
      }
    }
    cookieStore.delete(AUTH_COOKIE_NAME);
  } catch (error) {
    // Signing out must always clear the cookie, so this stays forgiving —
    // but the reason is no longer discarded.
    logServerError('auth:destroy-session', error);
  }
}

export async function cleanupExpiredSessions(): Promise<void> {
  await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}
