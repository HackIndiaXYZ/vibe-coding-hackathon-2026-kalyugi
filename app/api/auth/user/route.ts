export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware';

/**
 * GET /api/auth/user
 * Returns the current authenticated user's profile from the database.
 */
export const GET = withAuth(async (req, user, supabase) => {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id) // RLS handles this, but double check at application layer
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch profile: ${error.message}` },
        { status: 500 }
      );
    }

    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'User profile not found.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: profile,
    });
  } catch (err: any) {
    console.error('Fetch profile API error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error while fetching profile.' },
      { status: 500 }
    );
  }
});
