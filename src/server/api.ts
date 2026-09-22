import 'server-only';

import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { verifySession } from '@/server/auth/session';
import { logServerError } from '@/server/log';
import type { ApiResponse, SessionUser } from '@/types';

/**
 * Shared shape for authenticated JSON routes: resolves the session,
 * returns 401 without one, and converts an unexpected throw into a
 * generic 500 while logging the real reason server-side.
 *
 * Every data access inside `handler` must be scoped by `user.id` — the
 * ownership rule is that no route ever looks a record up by id alone.
 */
export function authed<Ctx = unknown>(
  scope: string,
  handler: (user: SessionUser, request: Request, ctx: Ctx) => Promise<NextResponse>
) {
  return async (request: Request, ctx: Ctx): Promise<NextResponse> => {
    const user = await verifySession().catch((error) => {
      logServerError(`${scope}:session`, error);
      return null;
    });
    if (!user) return fail('Not authenticated', 401);
    try {
      return await handler(user, request, ctx);
    } catch (error) {
      logServerError(scope, error);
      return fail('Something went wrong. Please try again.', 500);
    }
  };
}

export function ok<T>(data: T, message?: string, status = 200) {
  return NextResponse.json<ApiResponse<T>>({ success: true, data, ...(message ? { message } : {}) }, { status });
}

export function fail(error: string, status: number) {
  return NextResponse.json<ApiResponse>({ success: false, error }, { status });
}

export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<{ data: T } | { error: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: fail('Request body must be JSON', 400) };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { error: fail(parsed.error.issues[0]?.message ?? 'Invalid input', 400) };
  return { data: parsed.data };
}

/** Prisma unique-constraint violation. */
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === 'P2002';
}
