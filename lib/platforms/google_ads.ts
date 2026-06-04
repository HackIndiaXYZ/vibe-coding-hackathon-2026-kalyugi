import { fetchWithRetry } from './utils';
import { refreshGoogleToken } from './tokens';

export interface GoogleAdsReportData {
  impressions: number;
  clicks: number;
  ctr: number; // percentage (e.g. 2.5 for 2.5%)
  avg_cpc: number; // in INR
  spend_inr: number; // in INR
  conversions: number;
}

export async function fetchGoogleAdsData(
  accessToken: string,
  customerId: string,
  startDate: string,
  endDate: string,
  integrationId?: string,
  userId?: string
): Promise<GoogleAdsReportData | { error: string }> {
  if (accessToken.startsWith('mock_') || customerId.startsWith('mock_') || accessToken === 'MOCK_TOKEN_ENCRYPTED') {
    console.log("Google Ads fetch: returning mock data");
    return {
      impressions: 142000,
      clicks: 5840,
      ctr: 4.11,
      avg_cpc: 12.5,
      spend_inr: 73000,
      conversions: 245
    };
  }

  // Format the customerId by removing dashes if present
  const cleanCustomerId = customerId.replace(/-/g, '');
  const url = `https://googleads.googleapis.com/v15/customers/${cleanCustomerId}/googleAds:search`;

  const query = `
    SELECT 
      metrics.impressions, 
      metrics.clicks, 
      metrics.ctr, 
      metrics.average_cpc, 
      metrics.cost_micros, 
      metrics.conversions 
    FROM campaign 
    WHERE segments.date >= '${startDate}' AND segments.date <= '${endDate}'
  `;

  const payload = { query };
  
  // Note: Google Ads API requires a developer token. In case it is not provided, 
  // we attempt to make the call, but support passing it via environment variable.
  const devToken = process.env.GOOGLE_DEVELOPER_TOKEN || '';

  const getHeaders = (token: string) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    if (devToken) {
      headers['developer-token'] = devToken;
    }
    return headers;
  };

  let token = accessToken;
  let response = await fetchWithRetry(url, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify(payload),
  });

  // Handle 401 Unauthorized: refresh and retry once
  if (response && response.status === 401 && integrationId && userId) {
    try {
      console.log(`Google Ads fetch got 401. Refreshing token for integration: ${integrationId}`);
      token = await refreshGoogleToken(integrationId, userId);
      response = await fetchWithRetry(url, {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify(payload),
      });
    } catch (refreshErr: any) {
      return { error: `Failed to refresh Google token during Google Ads fetch: ${refreshErr.message}` };
    }
  }

  if (response && response.error) {
    return { error: response.error };
  }

  try {
    const results = response.results || [];
    
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalCostMicros = BigInt(0); // Use BigInt to prevent overflow on very large accounts
    let totalConversions = 0;

    for (const row of results) {
      const metrics = row.metrics || {};
      totalImpressions += parseInt(metrics.impressions || '0', 10);
      totalClicks += parseInt(metrics.clicks || '0', 10);
      totalCostMicros += BigInt(metrics.costMicros || '0');
      totalConversions += parseFloat(metrics.conversions || '0');
    }

    const spend_inr = Number(totalCostMicros) / 1_000_000;
    
    // Overall CTR: clicks / impressions
    const ctr = totalImpressions > 0 
      ? Math.round((totalClicks / totalImpressions) * 100 * 100) / 100 
      : 0;

    // Overall average CPC: spend / clicks
    const avg_cpc = totalClicks > 0 
      ? Math.round((spend_inr / totalClicks) * 100) / 100 
      : 0;

    return {
      impressions: totalImpressions,
      clicks: totalClicks,
      ctr,
      avg_cpc,
      spend_inr: Math.round(spend_inr * 100) / 100,
      conversions: Math.round(totalConversions * 100) / 100,
    };
  } catch (err: any) {
    return { error: `Failed to parse Google Ads response data: ${err.message}` };
  }
}
