import { fetchWithRetry } from './utils';
import { refreshMetaToken } from './tokens';

export interface MetaCampaignData {
  campaign_name: string;
  impressions: number;
  clicks: number;
  spend: number;
  roas: number;
}

export interface MetaAdsReportData {
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number; // percentage (e.g. 1.25 for 1.25%)
  spend_inr: number; // in INR
  roas: number;
  top_campaigns: MetaCampaignData[];
}

export async function fetchMetaAdsData(
  accessToken: string,
  adAccountId: string,
  startDate: string,
  endDate: string,
  integrationId?: string,
  userId?: string
): Promise<MetaAdsReportData | { error: string }> {
  if (accessToken.startsWith('mock_') || adAccountId.startsWith('mock_') || accessToken === 'MOCK_TOKEN_ENCRYPTED') {
    console.log("Meta Ads fetch: returning mock data");
    return {
      impressions: 89400,
      reach: 78500,
      clicks: 2150,
      ctr: 2.4,
      spend_inr: 45000,
      roas: 3.2,
      top_campaigns: [
        { campaign_name: 'Brand Awareness - Conversions', impressions: 45000, clicks: 1200, spend: 22000, roas: 3.2 },
        { campaign_name: 'Retargeting - Catalog Sales', impressions: 24400, clicks: 650, spend: 15000, roas: 4.8 },
        { campaign_name: 'Prospecting - Lookalike 1%', impressions: 20000, clicks: 300, spend: 8000, roas: 2.1 }
      ]
    };
  }

  // Ensure the adAccountId has the "act_" prefix if not already present
  const cleanAdAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  
  const timeRange = JSON.stringify({ since: startDate, until: endDate });
  
  const accountUrl = `https://graph.facebook.com/v19.0/${cleanAdAccountId}/insights?level=account&fields=impressions,reach,clicks,ctr,spend,purchase_roas&time_range=${encodeURIComponent(timeRange)}`;
  const campaignUrl = `https://graph.facebook.com/v19.0/${cleanAdAccountId}/insights?level=campaign&fields=campaign_name,impressions,clicks,spend,purchase_roas&time_range=${encodeURIComponent(timeRange)}&limit=50`;

  let token = accessToken;
  
  // 1. Fetch account-level insights
  let accountResponse = await fetchWithRetry(accountUrl, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  // Handle 401 Unauthorized: refresh and retry once
  if (accountResponse && accountResponse.status === 401 && integrationId && userId) {
    try {
      console.log(`Meta Ads fetch got 401. Refreshing token for integration: ${integrationId}`);
      token = await refreshMetaToken(integrationId, userId);
      accountResponse = await fetchWithRetry(accountUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (refreshErr: any) {
      return { error: `Failed to refresh Meta token during Meta Ads fetch: ${refreshErr.message}` };
    }
  }

  if (accountResponse && accountResponse.error) {
    return { error: accountResponse.error };
  }

  // 2. Fetch campaign-level insights
  let campaignResponse = await fetchWithRetry(campaignUrl, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (campaignResponse && campaignResponse.error) {
    return { error: campaignResponse.error };
  }

  try {
    // Parse Account Insights
    const accountData = accountResponse.data?.[0] || {};
    const impressions = parseInt(accountData.impressions || '0', 10);
    const reach = parseInt(accountData.reach || '0', 10);
    const clicks = parseInt(accountData.clicks || '0', 10);
    const ctr = parseFloat(accountData.ctr || '0');
    const spend_inr = parseFloat(accountData.spend || '0');
    
    // Extract ROAS
    let roas = 0;
    if (accountData.purchase_roas) {
      const roasObj = accountData.purchase_roas.find(
        (action: any) => action.action_type === 'report_summary' || action.action_type === 'offsite_conversion.fb_pixel_purchase'
      ) || accountData.purchase_roas[0];
      roas = parseFloat(roasObj?.value || '0');
    }

    // Parse Campaigns
    const campaigns = campaignResponse.data || [];
    const mappedCampaigns: MetaCampaignData[] = campaigns.map((camp: any) => {
      let campRoas = 0;
      if (camp.purchase_roas) {
        const roasObj = camp.purchase_roas.find(
          (action: any) => action.action_type === 'report_summary' || action.action_type === 'offsite_conversion.fb_pixel_purchase'
        ) || camp.purchase_roas[0];
        campRoas = parseFloat(roasObj?.value || '0');
      }

      return {
        campaign_name: camp.campaign_name || 'Unnamed Campaign',
        impressions: parseInt(camp.impressions || '0', 10),
        clicks: parseInt(camp.clicks || '0', 10),
        spend: parseFloat(camp.spend || '0'),
        roas: campRoas,
      };
    });

    // Sort campaigns by spend descending and pick top 5
    const top_campaigns = mappedCampaigns
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 5);

    return {
      impressions,
      reach,
      clicks,
      ctr: Math.round(ctr * 100) / 100,
      spend_inr: Math.round(spend_inr * 100) / 100,
      roas: Math.round(roas * 100) / 100,
      top_campaigns,
    };
  } catch (err: any) {
    return { error: `Failed to parse Meta Ads response data: ${err.message}` };
  }
}
