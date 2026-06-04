export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';

/**
 * POST /api/auth/callback
 * Handles OAuth callback code exchange for Supabase session.
 */
export async function POST(req: NextRequest) {
  try {
    let code: string | null = null;

    try {
      const body = await req.json();
      code = body.code || null;
    } catch {
      // Fallback if body parsing fails, check query params
      const { searchParams } = new URL(req.url);
      code = searchParams.get('code');
    }

    if (!code) {
      return NextResponse.json(
        { success: false, error: 'Authorization code is required.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        session: data.session,
        user: data.user,
      },
    });
  } catch (err: any) {
    console.error('Auth callback handler error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error during auth callback.' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/callback
 * Legacy OAuth redirect target — forwards to the client callback page
 * so the session token is stored in localStorage before navigation.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const next = searchParams.get('next') || '/dashboard';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    if (!code) {
      return NextResponse.redirect(`${appUrl}/auth/callback?error=missing_code`);
    }

    const redirectUrl = new URL('/auth/callback', appUrl);
    redirectUrl.searchParams.set('code', code);
    redirectUrl.searchParams.set('next', next);

    return NextResponse.redirect(redirectUrl.toString());
  } catch (err: unknown) {
    console.error('Auth callback GET error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error during auth redirect.' },
      { status: 500 }
    );
  }
}
