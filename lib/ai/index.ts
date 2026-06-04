export interface AICommentaryResponse {
  executive_summary: string;
  channels: {
    meta_ads?: string;
    google_ads?: string;
    ga4?: string;
    search_console?: string;
  };
}

/**
 * Strips any potential PII (like account IDs, user emails, site URLs, or custom client names)
 * from the metrics snapshot, sending only aggregated numeric metrics.
 */
function cleanMetricsSnapshotForAI(metricsSnapshot: any) {
  const cleaned: any = {};

  if (metricsSnapshot.meta_ads) {
    cleaned.meta_ads = {
      impressions: metricsSnapshot.meta_ads.impressions,
      reach: metricsSnapshot.meta_ads.reach,
      clicks: metricsSnapshot.meta_ads.clicks,
      ctr: metricsSnapshot.meta_ads.ctr,
      spend_inr: metricsSnapshot.meta_ads.spend_inr,
      roas: metricsSnapshot.meta_ads.roas,
      // Campaign names are fine if anonymized, but to be absolutely safe,
      // we only include the metrics of campaigns or generic indexes, or we include
      // campaign name but strip any client specific info if we want campaign context.
      // Let's include campaign metrics with a generic placeholder or the raw name
      // if it does not contain PII. To be safe, we map them:
      top_campaigns: metricsSnapshot.meta_ads.top_campaigns?.map((c: any, index: number) => ({
        campaign_index: index + 1,
        impressions: c.impressions,
        clicks: c.clicks,
        spend: c.spend,
        roas: c.roas,
      })) || [],
    };
  }

  if (metricsSnapshot.google_ads) {
    cleaned.google_ads = {
      impressions: metricsSnapshot.google_ads.impressions,
      clicks: metricsSnapshot.google_ads.clicks,
      ctr: metricsSnapshot.google_ads.ctr,
      avg_cpc: metricsSnapshot.google_ads.avg_cpc,
      spend_inr: metricsSnapshot.google_ads.spend_inr,
      conversions: metricsSnapshot.google_ads.conversions,
    };
  }

  if (metricsSnapshot.ga4) {
    cleaned.ga4 = {
      sessions: metricsSnapshot.ga4.sessions,
      pageviews: metricsSnapshot.ga4.pageviews,
      bounce_rate: metricsSnapshot.ga4.bounce_rate,
      avg_session_duration: metricsSnapshot.ga4.avg_session_duration,
      top_pages: metricsSnapshot.ga4.top_pages?.map((p: any, index: number) => ({
        page_index: index + 1,
        pageviews: p.pageviews,
      })) || [],
    };
  }

  if (metricsSnapshot.search_console) {
    cleaned.search_console = {
      total_clicks: metricsSnapshot.search_console.total_clicks,
      total_impressions: metricsSnapshot.search_console.total_impressions,
      avg_ctr: metricsSnapshot.search_console.avg_ctr,
      avg_position: metricsSnapshot.search_console.avg_position,
      top_queries: metricsSnapshot.search_console.top_queries?.map((q: any, index: number) => ({
        query_index: index + 1,
        clicks: q.clicks,
        impressions: q.impressions,
        ctr: q.ctr,
        position: q.position,
      })) || [],
    };
  }

  return cleaned;
}

/**
 * Extracts a JSON block from the assistant's text response, in case it is wrapped in markdown.
 */
function extractJSONString(text: string): string {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }
  
  // Return the raw text if no code block tags are found
  return text.trim();
}

/**
 * Calls the Anthropic Claude API to generate the executive summary and channel commentary.
 */
export async function generateAICommentary(
  metricsSnapshot: any,
  tone: string = 'professional'
): Promise<AICommentaryResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  const cleanedMetrics = cleanMetricsSnapshotForAI(metricsSnapshot);

  if (!apiKey || apiKey === 'sk-ant-api03-your-key') {
    console.log("Using simulated AI commentary (mock mode)...");
    
    // Generate simulated commentary based on metrics snapshot
    const channels: any = {};
    let executive_summary = `Our client performance campaigns demonstrated healthy growth over the specified period. Overall conversions and click-through rates across search and social channels showed steady performance, with a positive trend in return on advertising spend (ROAS) and engagement. Tone format: ${tone}.`;
    
    if (metricsSnapshot.ga4) {
      channels.ga4 = `GA4 traffic showed solid engagement with ${metricsSnapshot.ga4.sessions.toLocaleString()} sessions and ${metricsSnapshot.ga4.pageviews.toLocaleString()} pageviews. Bounce rate held steady at ${metricsSnapshot.ga4.bounce_rate}%, suggesting strong relevance of landing page content.`;
    }
    if (metricsSnapshot.google_ads) {
      channels.google_ads = `Google Ads generated ${metricsSnapshot.google_ads.conversions} conversions from ${metricsSnapshot.google_ads.clicks.toLocaleString()} clicks, spending ₹${metricsSnapshot.google_ads.spend_inr.toLocaleString()}. Average CPC was ₹${metricsSnapshot.google_ads.avg_cpc} with an overall CTR of ${metricsSnapshot.google_ads.ctr}%.`;
    }
    if (metricsSnapshot.meta_ads) {
      channels.meta_ads = `Meta Ads campaign reach hit ${metricsSnapshot.meta_ads.reach.toLocaleString()} with a blended CTR of ${metricsSnapshot.meta_ads.ctr}%. Total spend was ₹${metricsSnapshot.meta_ads.spend_inr.toLocaleString()} returning an average ROAS of ${metricsSnapshot.meta_ads.roas}x across campaigns.`;
    }
    if (metricsSnapshot.search_console) {
      channels.search_console = `SEO performance remained strong with ${metricsSnapshot.search_console.total_clicks.toLocaleString()} organic clicks and ${metricsSnapshot.search_console.total_impressions.toLocaleString()} impressions. Average keyword rank position is ${metricsSnapshot.search_console.avg_position}.`;
    }

    return {
      executive_summary,
      channels,
    };
  }

  const systemPrompt = `You are an expert digital marketing analyst writing concise, insightful performance commentary for Indian SMB clients. Be specific with numbers. Use plain English. Avoid jargon. Tone: ${tone}`;
  
  const userPrompt = `Write an executive summary (3-4 sentences) and individual channel commentary (2-3 sentences each) for this report data: ${JSON.stringify(cleanedMetrics)}. Return ONLY valid JSON in this exact format: { "executive_summary": "string", "channels": { "meta_ads": "string", "google_ads": "string", "ga4": "string", "search_console": "string" } }`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: 1500,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const rawText = data.content?.[0]?.text;
  if (!rawText) {
    throw new Error('Anthropic API returned an empty text content.');
  }

  const jsonString = extractJSONString(rawText);

  try {
    const parsed: AICommentaryResponse = JSON.parse(jsonString);
    
    // Ensure structure is correct
    if (!parsed.executive_summary || !parsed.channels) {
      throw new Error("Missing required 'executive_summary' or 'channels' keys in AI response.");
    }

    return parsed;
  } catch (parseErr: any) {
    console.error('Failed to parse Claude JSON response. Raw text was:', rawText);
    throw new Error(`AI response JSON parsing failed: ${parseErr.message}`);
  }
}
