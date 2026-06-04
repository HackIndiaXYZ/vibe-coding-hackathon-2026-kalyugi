export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware';
import { generateSignedURL } from '@/lib/r2/r2';

/**
 * POST /api/reports/[id]/whatsapp-link
 * Generates a 72h signed URL and a pre-formatted WhatsApp message template for manual sharing.
 */
export const POST = withAuth(async (req, user, supabase, context) => {
  try {
    const { id } = context.params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Report ID parameter is required.' },
        { status: 400 }
      );
    }

    // 1. Fetch report and client details, validating ownership
    const { data: report, error: reportErr } = await supabase
      .from('reports')
      .select('*, clients (*)')
      .eq('id', id)
      .eq('user_id', user.id) // Enforce ownership
      .single();

    if (reportErr || !report) {
      return NextResponse.json(
        { success: false, error: 'Report not found or access denied.' },
        { status: 404 }
      );
    }

    if (!report.pdf_key) {
      return NextResponse.json(
        { success: false, error: 'PDF file is not generated yet for this report. Generate it first.' },
        { status: 400 }
      );
    }

    // 2. Regenerate a fresh signed PDF URL with 72 hours expiry (259200 seconds)
    const expirySeconds = 72 * 60 * 60;
    const signedUrl = await generateSignedURL(report.pdf_key, expirySeconds);

    // 3. Format period text (e.g. "October 2026")
    const formatPeriod = (startStr: string, endStr: string) => {
      const start = new Date(startStr);
      const end = new Date(endStr);
      const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
        return `${months[start.getMonth()]} ${start.getFullYear()}`;
      }
      return `${months[start.getMonth()]} ${start.getFullYear()} - ${months[end.getMonth()]} ${end.getFullYear()}`;
    };
    const periodText = formatPeriod(report.period_start, report.period_end);
    const clientName = report.clients?.name || 'Client';

    // 4. Construct WhatsApp sharing template message
    const messageTemplate = `Hi ${clientName}! Here's your performance report for ${periodText}: ${signedUrl} — Valid for 72 hours.`;

    return NextResponse.json({
      success: true,
      data: {
        url: signedUrl,
        message_template: messageTemplate,
      },
    });
  } catch (err: any) {
    console.error('WhatsApp link API error:', err);
    return NextResponse.json(
      { success: false, error: `Failed to generate WhatsApp share link: ${err.message}` },
      { status: 500 }
    );
  }
});
