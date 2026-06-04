import { fetchWithRetry } from './utils';
import { refreshGoogleToken } from './tokens';

export interface GA4ReportData {
  sessions: number;
  pageviews: number;
  bounce_rate: number; // percentage (e.g. 42.5 for 42.5%)
  avg_session_duration: number; // in seconds
  top_pages: Array<{ page_path: string; pageviews: number }>;
}

export async function fetchGA4Data(
  accessToken: string,
  propertyId: string,
  startDate: string,
  endDate: string,
  integrationId?: string,
  userId?: string
): Promise<GA4ReportData | { error: string }> {
  if (accessToken.startsWith('mock_') || propertyId.startsWith('mock_') || accessToken === 'MOCK_TOKEN_ENCRYPTED') {
    console.log("GA4 fetch: returning mock data");
    return {
      sessions: 12450,
      pageviews: 34120,
      bounce_rate: 42.5,
      avg_session_duration: 145,
      top_pages: [
        { page_path: '/', pageviews: 12400 },
        { page_path: '/pricing', pageviews: 5200 },
        { page_path: '/blog/marketing-guide', pageviews: 3100 },
        { page_path: '/features', pageviews: 2800 },
        { page_path: '/contact', pageviews: 1100 }
      ]
    };
  }

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

  const payload = {
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: 'sessions' },
      { name: 'screenPageViews' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
    ],
    dimensions: [{ name: 'pagePath' }],
    limit: 10,
  };

  let token = accessToken;
  let response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  // Handle 401 Unauthorized: refresh and retry once
  if (response && response.status === 401 && integrationId && userId) {
    try {
      console.log(`GA4 fetch got 401. Refreshing token for integration: ${integrationId}`);
      token = await refreshGoogleToken(integrationId, userId);
      response = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (refreshErr: any) {
      return { error: `Failed to refresh Google token during GA4 fetch: ${refreshErr.message}` };
    }
  }

  if (response && response.error) {
    return { error: response.error };
  }

  try {
    // Fallbacks if response rows or totals are missing
    const totals = response.totals?.[0]?.metricValues || [];
    const rows = response.rows || [];

    const sessions = parseInt(totals[0]?.value || '0', 10);
    const pageviews = parseInt(totals[1]?.value || '0', 10);
    // GA4 bounceRate is a ratio (e.g. 0.45). Convert to percentage (45.0)
    const bounce_rate = Math.round(parseFloat(totals[2]?.value || '0') * 100 * 10) / 10;
    const avg_session_duration = Math.round(parseFloat(totals[3]?.value || '0'));

    const top_pages = rows.map((row: any) => {
      const page_path = row.dimensionValues?.[0]?.value || 'unknown';
      const pageviews = parseInt(row.metricValues?.[1]?.value || '0', 10);
      return { page_path, pageviews };
    });

    return {
      sessions,
      pageviews,
      bounce_rate,
      avg_session_duration,
      top_pages,
    };
  } catch (err: any) {
    return { error: `Failed to parse GA4 response data: ${err.message}` };
  }
}
