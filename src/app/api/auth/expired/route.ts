import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, ROUTES } from '@/lib/constants';

/**
 * Clears a session cookie whose database row no longer exists, then
 * sends the person to sign in. See `requireUser` for why this cannot be a
 * direct redirect to /login.
 *
 * GET is deliberate: it is reached by a server-side redirect. The only
 * effect is removing the caller's own cookie, which a third-party page
 * could equally achieve by any logout link.
 */
export function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get('callbackUrl');
  const callbackUrl =
    requested && requested.startsWith('/') && !requested.startsWith('//')
      ? requested
      : ROUTES.dashboard;

  const loginUrl = new URL(ROUTES.login, request.url);
  loginUrl.searchParams.set('callbackUrl', callbackUrl);
  loginUrl.searchParams.set('reason', 'session-ended');

  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(AUTH_COOKIE_NAME);
  return response;
}
