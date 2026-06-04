export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { withAuth, withRateLimit } from '@/lib/middleware';
import { reportGenerateSchema } from '@/lib/validators';
import { getValidDecryptedToken } from '@/lib/platforms/tokens';
import { fetchGA4Data } from '@/lib/platforms/ga4';
import { fetchGoogleAdsData } from '@/lib/platforms/google_ads';
import { fetchMetaAdsData } from '@/lib/platforms/meta_ads';
import { fetchSearchConsoleData } from '@/lib/platforms/search_console';
import { generateAICommentary } from '@/lib/ai';
import { ReportTemplate } from '@/lib/pdf/ReportTemplate';
import { uploadPDF, generateSignedURL } from '@/lib/r2/r2';
import { renderToBuffer } from '@react-pdf/renderer';

/**
 * Parses the platform-specific account identifier out of the integration scope field.
 * Format in scope is expected to be either JSON like {"identifier": "123"} 
 * or a plain text keyword: "scope_info | identifier:123456"
 */
function getPlatformIdentifier(scopeField: string | null): string {
  if (!scopeField) return '';
  const trimmed = scopeField.trim();
  
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      return parsed.identifier || parsed.property_id || parsed.ad_account_id || parsed.customer_id || parsed.site_url || '';
    } catch {
      // Fall through to regex if JSON parse fails
    }
  }
  
  const match = trimmed.match(/(?:property_id|ad_account_id|customer_id|site_url|identifier):([^\s,]+)/);
  return match ? match[1] : trimmed;
}

/**
 * POST /api/reports/generate
 * Main orchestration endpoint for compiling AI-commentary performance reports and printing PDFs.
 */
export const POST = withAuth(
  withRateLimit(async (req, user, supabase) => {
    let reportId: string | null = null;
    
    try {
      const body = await req.json().catch(() => ({}));
      
      // 1. Validate Input
      const validationResult = reportGenerateSchema.safeParse(body);
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

      const { client_id, period_start, period_end, platforms } = validationResult.data;

      // 2. Validate Client Ownership & Get details
      const { data: client, error: clientErr } = await supabase
        .from('clients')
        .select('*')
        .eq('id', client_id)
        .eq('user_id', user.id) // Enforce ownership
        .single();

      if (clientErr || !client) {
        return NextResponse.json(
          { success: false, error: 'Client not found or access denied.' },
          { status: 404 }
        );
      }

      // 3. Retrieve User Profile Details (for colors/branding in PDF)
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileErr || !profile) {
        return NextResponse.json(
          { success: false, error: 'User profile not found.' },
          { status: 404 }
        );
      }

      // 4. Create initial Report Row with status 'generating'
      const { data: report, error: reportErr } = await supabase
        .from('reports')
        .insert({
          user_id: user.id,
          client_id,
          period_start,
          period_end,
          status: 'generating',
        })
        .select()
        .single();

      if (reportErr || !report) {
        return NextResponse.json(
          { success: false, error: `Failed to initialize report record: ${reportErr?.message}` },
          { status: 500 }
        );
      }

      reportId = report.id;

      // 5. Gather OAuth connection records for the selected platforms
      const { data: integrations, error: intErr } = await supabase
        .from('integrations')
        .select('*')
        .eq('client_id', client_id)
        .eq('user_id', user.id)
        .in('platform', platforms);

      if (intErr || !integrations || integrations.length === 0) {
        // Mark report as failed
        await supabase.from('reports').update({ status: 'failed' }).eq('id', reportId);
        return NextResponse.json(
          { success: false, error: 'No active integrations found for the specified client and platforms.' },
          { status: 400 }
        );
      }

      // Map integrations by platform
      const integrationsByPlatform = new Map(integrations.map((i) => [i.platform, i]));

      // 6. Fetch platform metrics from third-party APIs
      const metricsSnapshot: any = {};
      const fetchErrors: string[] = [];

      for (const platform of platforms) {
        const integration = integrationsByPlatform.get(platform);
        if (!integration) {
          fetchErrors.push(`Missing integration for platform: ${platform}`);
          continue;
        }

        try {
          // Verify, refresh if necessary, and decrypt token
          const decryptedToken = await getValidDecryptedToken(integration.id, user.id);
          const identifier = getPlatformIdentifier(integration.scope);

          if (!identifier) {
            fetchErrors.push(`Missing account identifier in integration scope for platform: ${platform}`);
            continue;
          }

          let data: any;

          if (platform === 'ga4') {
            data = await fetchGA4Data(decryptedToken, identifier, period_start, period_end, integration.id, user.id);
          } else if (platform === 'google_ads') {
            data = await fetchGoogleAdsData(decryptedToken, identifier, period_start, period_end, integration.id, user.id);
          } else if (platform === 'meta_ads') {
            data = await fetchMetaAdsData(decryptedToken, identifier, period_start, period_end, integration.id, user.id);
          } else if (platform === 'search_console') {
            data = await fetchSearchConsoleData(decryptedToken, identifier, period_start, period_end, integration.id, user.id);
          }

          if (data && 'error' in data) {
            fetchErrors.push(`Error fetching ${platform} data: ${data.error}`);
          } else {
            metricsSnapshot[platform] = data;
          }
        } catch (fetchErr: any) {
          fetchErrors.push(`Critical failure fetching ${platform} data: ${fetchErr.message}`);
        }
      }

      // If we failed to get data for all selected platforms, mark report as failed
      if (Object.keys(metricsSnapshot).length === 0) {
        await supabase.from('reports').update({ status: 'failed' }).eq('id', reportId);
        return NextResponse.json(
          { success: false, error: `Failed to fetch data for any platform. Errors: ${fetchErrors.join(' | ')}` },
          { status: 500 }
        );
      }

      // 7. Call Claude API to generate Commentary
      let aiResponse: any;
      try {
        aiResponse = await generateAICommentary(metricsSnapshot, profile.ai_tone || 'professional');
      } catch (aiErr: any) {
        await supabase.from('reports').update({ status: 'failed' }).eq('id', reportId);
        return NextResponse.json(
          { success: false, error: `AI commentary generation failed: ${aiErr.message}` },
          { status: 524 } // Acknowledge AI gateway timeout/error code
        );
      }

      // 8. Store AI summary and metrics snapshot in database
      const { error: updateReportErr } = await supabase
        .from('reports')
        .update({
          ai_summary: aiResponse.executive_summary,
          metrics_snapshot: metricsSnapshot,
          generated_at: new Date().toISOString(),
        })
        .eq('id', reportId);

      if (updateReportErr) {
        await supabase.from('reports').update({ status: 'failed' }).eq('id', reportId);
        return NextResponse.json(
          { success: false, error: `Failed to save AI commentary in report row: ${updateReportErr.message}` },
          { status: 500 }
        );
      }

      // 9. Insert individual platform sections
      const sectionsToInsert = Object.keys(metricsSnapshot).map((platform, index) => ({
        report_id: reportId!,
        platform: platform as any,
        metrics: metricsSnapshot[platform],
        ai_commentary: aiResponse.channels[platform] || 'No commentary generated.',
        is_visible: true,
        order_index: index + 1,
      }));

      const { data: insertedSections, error: sectionsErr } = await supabase
        .from('report_sections')
        .insert(sectionsToInsert)
        .select();

      if (sectionsErr || !insertedSections) {
        await supabase.from('reports').update({ status: 'failed' }).eq('id', reportId);
        return NextResponse.json(
          { success: false, error: `Failed to save report sections: ${sectionsErr?.message}` },
          { status: 500 }
        );
      }

      // 10. Generate PDF using react-pdf in-memory compilation
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
              name: client.name,
              industry: client.industry,
              logo_url: client.logo_url,
            }}
            report={{
              period_start,
              period_end,
              ai_summary: aiResponse.executive_summary,
              metrics_snapshot: metricsSnapshot,
            }}
            sections={insertedSections.map((sec) => ({
              platform: sec.platform,
              metrics: sec.metrics,
              ai_commentary: sec.ai_commentary,
              is_visible: sec.is_visible,
            }))}
          />
        );

        pdfBuffer = await renderToBuffer(templateElement);
      } catch (pdfErr: any) {
        console.error('PDF rendering failed:', pdfErr);
        await supabase.from('reports').update({ status: 'failed' }).eq('id', reportId);
        return NextResponse.json(
          { success: false, error: `PDF Document generation failed: ${pdfErr.message}` },
          { status: 500 }
        );
      }

      // 11. Upload PDF to Cloudflare R2
      let pdfKey = '';
      try {
        pdfKey = await uploadPDF(user.id, reportId!, pdfBuffer);
      } catch (r2Err: any) {
        console.error('Cloudflare R2 upload failed:', r2Err);
        await supabase.from('reports').update({ status: 'failed' }).eq('id', reportId);
        return NextResponse.json(
          { success: false, error: `Cloudflare R2 storage upload failed: ${r2Err.message}` },
          { status: 500 }
        );
      }

      // 12. Generate Signed URL (7-day expiry)
      let signedPdfUrl = '';
      try {
        // 7 days = 604800 seconds
        signedPdfUrl = await generateSignedURL(pdfKey, 7 * 24 * 60 * 60);
      } catch (signErr: any) {
        console.error('Signed URL generation failed:', signErr);
        await supabase.from('reports').update({ status: 'failed' }).eq('id', reportId);
        return NextResponse.json(
          { success: false, error: `Signed URL generation failed: ${signErr.message}` },
          { status: 500 }
        );
      }

      // 13. Update Report row to status 'ready' and save URL and Key
      const { error: finalErr } = await supabase
        .from('reports')
        .update({
          status: 'ready',
          pdf_url: signedPdfUrl,
          pdf_key: pdfKey,
        })
        .eq('id', reportId);

      if (finalErr) {
        await supabase.from('reports').update({ status: 'failed' }).eq('id', reportId);
        return NextResponse.json(
          { success: false, error: `Failed to finalize report status: ${finalErr.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          report_id: reportId,
          pdf_url: signedPdfUrl,
          status: 'ready',
          warnings: fetchErrors.length > 0 ? fetchErrors : undefined,
        },
      });
    } catch (err: any) {
      console.error('Orchestration critical error:', err);
      if (reportId) {
        const db = supabase;
        await db.from('reports').update({ status: 'failed' }).eq('id', reportId);
      }
      return NextResponse.json(
        { success: false, error: `Report orchestration critical failure: ${err.message}` },
        { status: 500 }
      );
    }
  }, 'report-generate')
);
