import { fetchWithRetry } from './utils';
import { refreshGoogleToken } from './tokens';

export interface SearchConsoleQueryData {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number; // percentage (e.g. 5.5 for 5.5%)
  position: number;
}

export interface SearchConsoleReportData {
  total_clicks: number;
  total_impressions: number;
  avg_ctr: number; // percentage (e.g. 4.2 for 4.2%)
  avg_position: number;
  top_queries: SearchConsoleQueryData[];
}

export async function fetchSearchConsoleData(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  integrationId?: string,
  userId?: string
): Promise<SearchConsoleReportData | { error: string }> {
  if (accessToken.startsWith('mock_') || siteUrl.startsWith('mock_') || accessToken === 'MOCK_TOKEN_ENCRYPTED') {
    console.log("Search Console fetch: returning mock data");
    return {
      total_clicks: 8420,
      total_impressions: 198000,
      avg_ctr: 4.25,
      avg_position: 8.4,
      top_queries: [
        { query: 'ai reporting software', clicks: 1200, impressions: 18000, ctr: 6.67, position: 2.1 },
        { query: 'client report generator', clicks: 850, impressions: 14200, ctr: 5.99, position: 3.4 },
        { query: 'marketing dashboard automation', clicks: 420, impressions: 8900, ctr: 4.72, position: 5.6 }
      ]
    };
  }

  // Search Console API requires siteUrl to be URL encoded. If it contains protocol, encode it.
  const encodedSiteUrl = encodeURIComponent(siteUrl);
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodedSiteUrl}/searchAnalytics/query`;

  const totalsPayload = {
    startDate,
    endDate,
  };

  const queriesPayload = {
    startDate,
    endDate,
    dimensions: ['query'],
    rowLimit: 10,
  };

  let token = accessToken;

  // 1. Fetch site-level totals
  let totalsResponse = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(totalsPayload),
  });

  // Handle 401 Unauthorized: refresh and retry once
  if (totalsResponse && totalsResponse.status === 401 && integrationId && userId) {
    try {
      console.log(`Search Console fetch got 401. Refreshing token for integration: ${integrationId}`);
      token = await refreshGoogleToken(integrationId, userId);
      totalsResponse = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(totalsPayload),
      });
    } catch (refreshErr: any) {
      return { error: `Failed to refresh Google token during Search Console fetch: ${refreshErr.message}` };
    }
  }

  if (totalsResponse && totalsResponse.error) {
    return { error: totalsResponse.error };
  }

  // 2. Fetch top 10 queries
  let queriesResponse = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(queriesPayload),
  });

  if (queriesResponse && queriesResponse.error) {
    return { error: queriesResponse.error };
  }

  try {
    // Parse site-level totals
    const totalRow = totalsResponse.rows?.[0] || {};
    const total_clicks = parseInt(totalRow.clicks || '0', 10);
    const total_impressions = parseInt(totalRow.impressions || '0', 10);
    // Convert CTR ratio to percentage
    const avg_ctr = Math.round(parseFloat(totalRow.ctr || '0') * 100 * 100) / 100;
    const avg_position = Math.round(parseFloat(totalRow.position || '0') * 10) / 10;

    // Parse queries
    const queryRows = queriesResponse.rows || [];
    const top_queries: SearchConsoleQueryData[] = queryRows.map((row: any) => {
      const query = row.keys?.[0] || 'unknown';
      const clicks = parseInt(row.clicks || '0', 10);
      const impressions = parseInt(row.impressions || '0', 10);
      const ctr = Math.round(parseFloat(row.ctr || '0') * 100 * 100) / 100;
      const position = Math.round(parseFloat(row.position || '0') * 10) / 10;

      return {
        query,
        clicks,
        impressions,
        ctr,
        position,
      };
    });

    return {
      total_clicks,
      total_impressions,
      avg_ctr,
      avg_position,
      top_queries,
    };
  } catch (err: any) {
    return { error: `Failed to parse Search Console response data: ${err.message}` };
  }
}
