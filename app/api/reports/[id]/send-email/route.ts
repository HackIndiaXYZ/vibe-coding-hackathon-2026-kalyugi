export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware';
import { reportEmailSchema } from '@/lib/validators';
import { generateSignedURL } from '@/lib/r2/r2';
import { sendReportEmail } from '@/lib/email/email';

/**
 * POST /api/reports/[id]/send-email
 * Sends the generated report PDF to a recipient via Resend.
 * Body: { recipient_email, recipient_name, custom_message? }
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

    const body = await req.json().catch(() => ({}));

    // 1. Zod input validation
    const validationResult = reportEmailSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Validation failed.', 
          details: validationResult.error.flatten().fieldErrors 
        },
        { status: 400 }
      );
    }

    const { recipient_email, recipient_name, custom_message } = validationResult.data;

    // 2. Fetch report and client details, validating ownership at application layer
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

    // 3. Fetch user profile for email branding
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    const agencyName = profile?.agency_name || 'Your Marketing Agency';
    const clientName = report.clients?.name || 'Client';
    const brandColor = profile?.brand_primary_color || '#0EA5E9';

    // Format Period (e.g. "October 2026")
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

    // 4. Regenerate a fresh signed PDF URL (72h expiry = 259200 seconds)
    const expirySeconds = 72 * 60 * 60;
    const signedUrl = await generateSignedURL(report.pdf_key, expirySeconds);

    // 5. Send email via Resend
    const emailResult = await sendReportEmail({
      recipientEmail: recipient_email,
      recipientName: recipient_name,
      agencyName,
      clientName,
      periodText,
      customMessage: custom_message || undefined,
      pdfKey: report.pdf_key,
      signedUrl,
      brandPrimaryColor: brandColor,
    });

    // 6. Update sent_at timestamp in database
    const now = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from('reports')
      .update({ sent_at: now })
      .eq('id', id)
      .eq('user_id', user.id);

    if (updateErr) {
      console.warn(`Email sent successfully, but failed to update sent_at in DB: ${updateErr.message}`);
    }

    return NextResponse.json({
      success: true,
      message: `Performance report successfully sent to ${recipient_email}.`,
      data: {
        message_id: emailResult.messageId,
        sent_at: now,
      },
    });
  } catch (err: any) {
    console.error('Send email API error:', err);
    return NextResponse.json(
      { success: false, error: `Failed to deliver report email: ${err.message}` },
      { status: 500 }
    );
  }
});
