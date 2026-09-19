import 'server-only';

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { prisma } from '@/server/db';
import { AUTH_COOKIE_NAME, AUTH_COOKIE_MAX_AGE, SESSION_EXPIRY_DAYS } from '@/lib/constants';
import { getAuthSecret } from './secret';
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

export async function verifySession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const jwt = cookieStore.get(AUTH_COOKIE_NAME)?.value;
    if (!jwt) return null;

    const { payload } = await jwtVerify(jwt, getAuthSecret());
    const sessionId = payload.sessionId as string;
    const token = payload.token as string;

    if (!sessionId || !token) return null;

    const session = await prisma.session.findUnique({
      where: { id: sessionId, token },
      include: { user: { select: { id: true, email: true, name: true, emailVerified: true, image: true } } },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await prisma.session.delete({ where: { id: session.id } });
      }
      return null;
    }

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    };
  } catch {
    return null;
  }
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
  } catch {
    // Ignore errors during cleanup
  }
}

export async function cleanupExpiredSessions(): Promise<void> {
  await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}
