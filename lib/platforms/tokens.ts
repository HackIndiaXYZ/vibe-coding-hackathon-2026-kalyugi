import { getSupabaseServiceClient } from '@/lib/supabase/client';
import { encryptToken, decryptToken } from '@/lib/encryption';

interface DecryptedTokens {
  accessToken: string;
  refreshToken: string;
  platform: string;
  tokenExpiresAt: string;
}

/**
 * Retrieves and decrypts the access and refresh tokens for a specific integration.
 * Requires userId to validate ownership at the application layer.
 */
export async function getDecryptedToken(integrationId: string, userId: string): Promise<DecryptedTokens> {
  const supabase = getSupabaseServiceClient();

  const { data: integration, error } = await supabase
    .from('integrations')
    .select('access_token_encrypted, refresh_token_encrypted, platform, token_expires_at, user_id')
    .eq('id', integrationId)
    .eq('user_id', userId) // Ownership validation
    .single();

  if (error || !integration) {
    throw new Error(`Integration not found or access denied for ID: ${integrationId}`);
  }

  const accessToken = decryptToken(integration.access_token_encrypted);
  const refreshToken = decryptToken(integration.refresh_token_encrypted);

  return {
    accessToken,
    refreshToken,
    platform: integration.platform,
    tokenExpiresAt: integration.token_expires_at,
  };
}

/**
 * Refreshes a Google access token using the stored refresh token.
 * Re-encrypts and updates the database.
 */
export async function refreshGoogleToken(integrationId: string, userId: string): Promise<string> {
  const supabase = getSupabaseServiceClient();

  // Retrieve current integration tokens
  const { data: integration, error } = await supabase
    .from('integrations')
    .select('refresh_token_encrypted, user_id')
    .eq('id', integrationId)
    .eq('user_id', userId)
    .single();

  if (error || !integration) {
    throw new Error(`Google integration not found or access denied: ${integrationId}`);
  }

  const decryptedRefreshToken = decryptToken(integration.refresh_token_encrypted);

  if (decryptedRefreshToken.startsWith('mock_') || decryptedRefreshToken === 'MOCK_REFRESH_TOKEN_ENCRYPTED') {
    return 'mock_google_access_token_refreshed';
  }

  // Call Google OAuth token refresh endpoint
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: decryptedRefreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to refresh Google token: ${errorText}`);
  }

  const data = await response.json();
  const newAccessTokenEncrypted = encryptToken(data.access_token);
  const tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  // Update DB
  const { error: updateError } = await supabase
    .from('integrations')
    .update({
      access_token_encrypted: newAccessTokenEncrypted,
      token_expires_at: tokenExpiresAt,
    })
    .eq('id', integrationId)
    .eq('user_id', userId);

  if (updateError) {
    throw new Error(`Failed to save refreshed Google token: ${updateError.message}`);
  }

  return data.access_token;
}

/**
 * Refreshes/extends a Meta access token.
 * Meta uses long-lived tokens which last 60 days. Exchanging an active
 * long-lived token extends its life for another 60 days.
 */
export async function refreshMetaToken(integrationId: string, userId: string): Promise<string> {
  const supabase = getSupabaseServiceClient();

  // Retrieve current integration tokens
  const { data: integration, error } = await supabase
    .from('integrations')
    .select('access_token_encrypted, user_id')
    .eq('id', integrationId)
    .eq('user_id', userId)
    .single();

  if (error || !integration) {
    throw new Error(`Meta integration not found or access denied: ${integrationId}`);
  }

  const decryptedAccessToken = decryptToken(integration.access_token_encrypted);

  if (decryptedAccessToken.startsWith('mock_')) {
    return 'mock_meta_access_token_refreshed';
  }

  // Exchange the token for an extended one
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  const url = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${decryptedAccessToken}`;

  const response = await fetch(url, { method: 'GET' });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to refresh Meta token: ${errorText}`);
  }

  const data = await response.json();
  const newAccessTokenEncrypted = encryptToken(data.access_token);
  // Default to 60 days if expires_in is not returned
  const expiresIn = data.expires_in || 5184000;
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  // Update DB (Meta refresh token will just be the same access token or empty)
  const { error: updateError } = await supabase
    .from('integrations')
    .update({
      access_token_encrypted: newAccessTokenEncrypted,
      token_expires_at: tokenExpiresAt,
    })
    .eq('id', integrationId)
    .eq('user_id', userId);

  if (updateError) {
    throw new Error(`Failed to save refreshed Meta token: ${updateError.message}`);
  }

  return data.access_token;
}

/**
 * Checks if a token is expired or within 5 minutes of expiring.
 * Refreshes the token proactively if necessary and returns a valid decrypted access token.
 */
export async function getValidDecryptedToken(integrationId: string, userId: string): Promise<string> {
  const tokens = await getDecryptedToken(integrationId, userId);
  const expiryTime = new Date(tokens.tokenExpiresAt).getTime();
  const fiveMinutesInMs = 5 * 60 * 1000;

  if (Date.now() + fiveMinutesInMs >= expiryTime) {
    // Proactive refresh
    if (tokens.platform === 'google_ads' || tokens.platform === 'ga4' || tokens.platform === 'search_console') {
      return await refreshGoogleToken(integrationId, userId);
    } else if (tokens.platform === 'meta_ads') {
      return await refreshMetaToken(integrationId, userId);
    } else {
      throw new Error(`Unsupported integration platform for token refresh: ${tokens.platform}`);
    }
  }

  return tokens.accessToken;
}
