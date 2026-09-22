/**
 * Edge auth gate.
 *
 * Renamed from the deprecated `middleware` convention to `proxy`, which
 * Next 16 asks for. Behaviour is unchanged: it verifies the JWT
 * signature cheaply at the edge to decide redirects, while the server
 * still re-validates every session against the database before serving
 * any data.
 */
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { AUTH_COOKIE_NAME, ROUTES } from '@/lib/constants';
import { getAuthSecret } from '@/server/auth/secret';

const protectedPaths = ['/dashboard', '/research', '/watchlist', '/news', '/settings', '/portfolio', '/alerts'];
const authPaths = ['/login', '/register', '/forgot-password', '/reset-password'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  let isAuthenticated = false;
  if (sessionCookie) {
    try {
      await jwtVerify(sessionCookie, getAuthSecret());
      isAuthenticated = true;
    } catch {
      // Invalid or expired token
    }
  }

  // Redirect authenticated users away from auth pages
  if (isAuthenticated && authPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL(ROUTES.dashboard, request.url));
  }

  // Redirect unauthenticated users from protected pages
  if (!isAuthenticated && protectedPaths.some((p) => pathname.startsWith(p))) {
    const loginUrl = new URL(ROUTES.login, request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/research/:path*',
    '/watchlist/:path*',
    '/news/:path*',
    '/settings/:path*',
    '/portfolio/:path*',
    '/alerts/:path*',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
  ],
};
