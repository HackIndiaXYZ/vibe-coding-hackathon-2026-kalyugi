export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware';

/**
 * GET /api/reports
 * Lists all reports for the current user with client details joined.
 */
export const GET = withAuth(async (req, user, supabase) => {
  try {
    // Perform selection joining client name
    const { data: reports, error } = await supabase
      .from('reports')
      .select('*, clients (name)')
      .eq('user_id', user.id) // Enforce ownership
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch reports: ${error.message}` },
        { status: 500 }
      );
    }

    // Flatten client name into client_name for convenience
    const formattedReports = reports.map((r: any) => ({
      ...r,
      client_name: r.clients?.name || 'Unknown Client',
      clients: undefined, // remove nested object
    }));

    return NextResponse.json({
      success: true,
      data: formattedReports,
    });
  } catch (err: any) {
    console.error('List reports API error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error while listing reports.' },
      { status: 500 }
    );
  }
});
