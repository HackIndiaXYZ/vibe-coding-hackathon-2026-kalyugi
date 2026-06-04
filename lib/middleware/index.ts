import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';

export type AuthenticatedUser = {
  id: string;
  email?: string;
};

export type AuthenticatedRouteHandler = (
  req: NextRequest,
  user: AuthenticatedUser,
  supabase: ReturnType<typeof getSupabaseClient>,
  context?: any
) => Promise<Response>;

// In-memory rate limiting store
interface RateLimitRecord {
  count: number;
  resetTime: number;
}
const rateLimitStore = new Map<string, RateLimitRecord>();

/**
 * Checks in-memory rate limit for a user.
 * - data-fetch: Max 20 requests/minute (60 seconds)
 * - report-generate: Max 5 report generations/hour (3600 seconds)
 */
export function checkRateLimit(
  userId: string,
  type: 'data-fetch' | 'report-generate'
): { allowed: boolean; reset?: number } {
  const limit = type === 'data-fetch' ? 20 : 5;
  const duration = type === 'data-fetch' ? 60 * 1000 : 60 * 60 * 1000;

  const key = `${userId}:${type}`;
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetTime) {
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + duration,
    });
    return { allowed: true };
  }

  if (record.count >= limit) {
    return { allowed: false, reset: record.resetTime };
  }

  record.count += 1;
  return { allowed: true };
}

/**
 * Authentication middleware wrapper.
 * Validates the Supabase JWT token from the Authorization header.
 * Attaches the authenticated user details and a user-scoped Supabase client.
 */
export function withAuth(handler: AuthenticatedRouteHandler) {
  return async (req: NextRequest, context?: any) => {
    try {
      const authHeader = req.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized: Missing or invalid token format.' },
          { status: 401 }
        );
      }

      const token = authHeader.substring(7);
      const supabase = getSupabaseClient(token);

      // Verify the JWT token and retrieve the user
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized: Invalid token or expired session.' },
          { status: 401 }
        );
      }

      return await handler(req, { id: user.id, email: user.email }, supabase, context);
    } catch (err: any) {
      console.error('Auth middleware error:', err);
      return NextResponse.json(
        { success: false, error: 'Internal server error during authentication.' },
        { status: 500 }
      );
    }
  };
}

/**
 * Rate Limiting middleware wrapper.
 * Must be composed inside `withAuth` to have access to the `user` object.
 * Usage: `withAuth(withRateLimit(handler, 'data-fetch'))`
 */
export function withRateLimit(
  handler: AuthenticatedRouteHandler,
  limitType: 'data-fetch' | 'report-generate'
): AuthenticatedRouteHandler {
  return async (req: NextRequest, user: AuthenticatedUser, supabase: any, context?: any) => {
    try {
      const rateLimitCheck = checkRateLimit(user.id, limitType);
      
      if (!rateLimitCheck.allowed) {
        const resetSeconds = rateLimitCheck.reset
          ? Math.ceil((rateLimitCheck.reset - Date.now()) / 1000)
          : 60;

        return NextResponse.json(
          {
            success: false,
            error: `Too Many Requests: Rate limit exceeded. Try again in ${resetSeconds} seconds.`,
            code: 'RATE_LIMIT_EXCEEDED',
          },
          {
            status: 429,
            headers: {
              'Retry-After': String(resetSeconds),
            },
          }
        );
      }

      return await handler(req, user, supabase, context);
    } catch (err: any) {
      console.error('Rate limit middleware error:', err);
      return NextResponse.json(
        { success: false, error: 'Internal server error during rate limiting.' },
        { status: 500 }
      );
    }
  };
}
