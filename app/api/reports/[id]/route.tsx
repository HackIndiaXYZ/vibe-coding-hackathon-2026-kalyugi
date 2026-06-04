export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware';
import { reportUpdateSchema } from '@/lib/validators';
import { ReportTemplate } from '@/lib/pdf/ReportTemplate';
import { uploadPDF, generateSignedURL, deletePDF } from '@/lib/r2/r2';
import { renderToBuffer } from '@react-pdf/renderer';

/**
 * GET /api/reports/[id]
 * Retrieves a single report with client details, user profile, and all sections.
 * Automatically regenerates and updates the signed PDF URL to ensure it never expires.
 */
export const GET = withAuth(async (req, user, supabase, context) => {
  try {
    const { id } = context.params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Report ID parameter is required.' },
        { status: 400 }
      );
    }

    // Retrieve report with client join
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

    // Retrieve report sections
    const { data: sections, error: sectionsErr } = await supabase
      .from('report_sections')
      .select('*')
      .eq('report_id', id)
      .order('order_index', { ascending: true });

    if (sectionsErr) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch report sections: ${sectionsErr.message}` },
        { status: 500 }
      );
    }

    // Regenerate signed PDF URL (7-day expiry) if PDF exists in R2
    let pdfUrl = report.pdf_url;
    if (report.pdf_key) {
      try {
        pdfUrl = await generateSignedURL(report.pdf_key, 7 * 24 * 60 * 60);
        // Silently update database with the fresh signed URL
        await supabase
          .from('reports')
          .update({ pdf_url: pdfUrl })
          .eq('id', id);
      } catch (r2Err: any) {
        console.warn(`Failed to regenerate signed R2 URL: ${r2Err.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...report,
        pdf_url: pdfUrl,
        client: report.clients,
        clients: undefined,
        sections,
      },
    });
  } catch (err: any) {
    console.error('Get report API error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error while retrieving report.' },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/reports/[id]
 * Updates report commentary (executive summary or channel commentary).
 * Automatically regenerates and uploads the updated PDF to Cloudflare R2.
 */
export const PUT = withAuth(async (req, user, supabase, context) => {
  try {
    const { id } = context.params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Report ID parameter is required.' },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));

    // Zod validation
    const validationResult = reportUpdateSchema.safeParse(body);
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

    const { ai_summary, platform, ai_commentary } = validationResult.data;

    // 1. Double check report ownership
    const { data: reportExists, error: existErr } = await supabase
      .from('reports')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (existErr || !reportExists) {
      return NextResponse.json(
        { success: false, error: 'Report not found or access denied.' },
        { status: 404 }
      );
    }

    // 2. Perform updates
    if (ai_summary !== undefined) {
      // Update executive summary on the report table
      const { error: repUpdateErr } = await supabase
        .from('reports')
        .update({ ai_summary })
        .eq('id', id)
        .eq('user_id', user.id);

      if (repUpdateErr) {
        return NextResponse.json(
          { success: false, error: `Failed to update report summary: ${repUpdateErr.message}` },
          { status: 500 }
        );
      }
    }

    if (platform !== undefined && ai_commentary !== undefined) {
      // Update section-specific commentary on the report_sections table
      // Double check that the section belongs to a report owned by this user via RLS
      const { error: secUpdateErr } = await supabase
        .from('report_sections')
        .update({ ai_commentary })
        .eq('report_id', id)
        .eq('platform', platform);

      if (secUpdateErr) {
        return NextResponse.json(
          { success: false, error: `Failed to update section commentary: ${secUpdateErr.message}` },
          { status: 500 }
        );
      }
    }

    // 3. Re-fetch all updated details to regenerate the PDF
    const { data: updatedReport } = await supabase
      .from('reports')
      .select('*, clients (*)')
      .eq('id', id)
      .single();

    const { data: updatedSections } = await supabase
      .from('report_sections')
      .select('*')
      .eq('report_id', id)
      .order('order_index', { ascending: true });

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!updatedReport || !updatedSections || !profile) {
      return NextResponse.json(
        { success: false, error: 'Failed to retrieve updated details for PDF rebuild.' },
        { status: 500 }
      );
    }

    // 4. Re-compile PDF buffer in memory
    let pdfBuffer: Buffer;
    try {
      const templateElement = (
        <ReportTemplate
          profile={{
            full_name: profile.full_name || '',
            agency_name: profile.agency_name || 'Agency',
            email: profile.email || '',
            logo_url: profile.logo_url,
            brand_primary_color: profile.brand_primary_color || '#0EA5E9',
            brand_accent_color: profile.brand_accent_color || '#06FFA5',
            brand_font: profile.brand_font || 'DM Sans',
          }}
          client={{
            name: updatedReport.clients.name,
            industry: updatedReport.clients.industry,
            logo_url: updatedReport.clients.logo_url,
          }}
          report={{
            period_start: updatedReport.period_start,
            period_end: updatedReport.period_end,
            ai_summary: updatedReport.ai_summary,
            metrics_snapshot: updatedReport.metrics_snapshot,
          }}
          sections={updatedSections.map((sec: any) => ({
            platform: sec.platform,
            metrics: sec.metrics,
            ai_commentary: sec.ai_commentary,
            is_visible: sec.is_visible,
          }))}
        />
      );

      pdfBuffer = await renderToBuffer(templateElement);
    } catch (pdfErr: any) {
      console.error('PDF recompilation failed:', pdfErr);
      return NextResponse.json(
        { success: false, error: `Failed to compile updated PDF document: ${pdfErr.message}` },
        { status: 500 }
      );
    }

    // 5. Overwrite the PDF in Cloudflare R2
    const pdfKey = updatedReport.pdf_key || `reports/${user.id}/${id}.pdf`;
    try {
      await uploadPDF(user.id, id, pdfBuffer);
    } catch (r2Err: any) {
      console.error('R2 upload overwrite failed:', r2Err);
      return NextResponse.json(
        { success: false, error: `Failed to upload updated PDF to storage: ${r2Err.message}` },
        { status: 500 }
      );
    }

    // 6. Generate fresh signed URL
    let signedPdfUrl = '';
    try {
      signedPdfUrl = await generateSignedURL(pdfKey, 7 * 24 * 60 * 60);
    } catch (signErr: any) {
      console.error('Signed URL overwrite failed:', signErr);
      return NextResponse.json(
        { success: false, error: `Failed to generate updated signed PDF URL: ${signErr.message}` },
        { status: 500 }
      );
    }

    // 7. Update final URL and Key in database
    const { error: finalErr } = await supabase
      .from('reports')
      .update({
        pdf_url: signedPdfUrl,
        pdf_key: pdfKey,
      })
      .eq('id', id);

    if (finalErr) {
      return NextResponse.json(
        { success: false, error: `Failed to save updated PDF URL: ${finalErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Commentary updated and PDF successfully rebuilt.',
      data: {
        report: {
          ...updatedReport,
          pdf_url: signedPdfUrl,
          client: updatedReport.clients,
          clients: undefined,
        },
        sections: updatedSections,
      },
    });
  } catch (err: any) {
    console.error('Update report API error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error while updating report.' },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/reports/[id]
 * Deletes report row from database and purges PDF file from R2.
 */
export const DELETE = withAuth(async (req, user, supabase, context) => {
  try {
    const { id } = context.params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Report ID parameter is required.' },
        { status: 400 }
      );
    }

    // Retrieve report first to get R2 pdf key and verify ownership
    const { data: report, error: fetchErr } = await supabase
      .from('reports')
      .select('pdf_key, user_id')
      .eq('id', id)
      .eq('user_id', user.id) // Enforce ownership
      .single();

    if (fetchErr || !report) {
      return NextResponse.json(
        { success: false, error: 'Report not found or access denied.' },
        { status: 404 }
      );
    }

    // 1. Purge PDF from Cloudflare R2 if it exists
    if (report.pdf_key) {
      try {
        await deletePDF(report.pdf_key);
      } catch (r2Err: any) {
        console.warn(`Failed to delete PDF from Cloudflare R2 (key: ${report.pdf_key}): ${r2Err.message}`);
        // We continue deleting from DB even if R2 delete fails
      }
    }

    // 2. Delete report from database (cascade deletes sections automatically)
    const { error: deleteErr } = await supabase
      .from('reports')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (deleteErr) {
      return NextResponse.json(
        { success: false, error: `Database delete failed: ${deleteErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Report and R2 PDF storage purged successfully.',
    });
  } catch (err: any) {
    console.error('Delete report API error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error while deleting report.' },
      { status: 500 }
    );
  }
});
