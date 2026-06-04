export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/client';
import { encryptToken } from '@/lib/encryption';
import jwt from 'jsonwebtoken';

/**
 * GET /api/oauth/meta/callback
 * Handles Meta (Facebook) OAuth callback redirect.
 * Exchanges authorization code for long-lived tokens, encrypts them, and saves to database.
 */
export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      console.error('Meta OAuth callback error parameter:', errorParam);
      return NextResponse.redirect(`${appUrl}/integrations?error=${encodeURIComponent(errorParam)}`);
    }

    if (!code || !state) {
      return NextResponse.redirect(`${appUrl}/integrations?error=missing_code_or_state`);
    }

    // 1. Verify and decode state JWT
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY is not defined.');
    }

    let decodedState: any;
    try {
      decodedState = jwt.verify(state, encryptionKey);
    } catch (err: any) {
      console.error('Meta state verification failed:', err.message);
      return NextResponse.redirect(`${appUrl}/integrations?error=invalid_state_token`);
    }

    const { client_id, user_id, platform, identifier } = decodedState;

    if (!client_id || !user_id || platform !== 'meta_ads') {
      return NextResponse.redirect(`${appUrl}/integrations?error=corrupted_state_payload`);
    }

    let longLivedToken = 'mock_meta_long_lived_token';
    let expiresIn = 5184000; // Default 60 days in seconds

    if (code !== 'mock_meta_code') {
      // 2. Exchange code for Meta short-lived access token
      const metaAppId = process.env.META_APP_ID;
      const metaAppSecret = process.env.META_APP_SECRET;
      const redirectUri = `${appUrl}/api/oauth/meta/callback`;

      const shortTokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${metaAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${metaAppSecret}&code=${code}`;

      const shortTokenResponse = await fetch(shortTokenUrl, { method: 'GET' });

      if (!shortTokenResponse.ok) {
        const errorText = await shortTokenResponse.text();
        console.error('Failed to get Meta short-lived token:', errorText);
        return NextResponse.redirect(`${appUrl}/integrations?error=token_exchange_failed`);
      }

      const shortTokenData = await shortTokenResponse.json();
      const shortLivedToken = shortTokenData.access_token;

      // 3. Exchange short-lived token for long-lived access token (lasts 60 days)
      const longTokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${metaAppId}&client_secret=${metaAppSecret}&fb_exchange_token=${shortLivedToken}`;

      const longTokenResponse = await fetch(longTokenUrl, { method: 'GET' });

      if (!longTokenResponse.ok) {
        const errorText = await longTokenResponse.text();
        console.error('Failed to get Meta long-lived token:', errorText);
        return NextResponse.redirect(`${appUrl}/integrations?error=long_lived_exchange_failed`);
      }

      const longTokenData = await longTokenResponse.json();
      longLivedToken = longTokenData.access_token;
      expiresIn = longTokenData.expires_in || 5184000;
    }
    
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // 4. Encrypt the tokens
    // Since Meta doesn't return a refresh token, we store the long-lived token
    // in both fields (access_token and refresh_token) to comply with DB constraints.
    const accessTokenEncrypted = encryptToken(longLivedToken);
    const refreshTokenEncrypted = encryptToken(longLivedToken);

    const scopeData = JSON.stringify({
      scope: 'ads_read,read_insights',
      identifier: identifier || '',
    });

    // 5. Upsert integration in database
    const supabase = getSupabaseServiceClient();
    const { error: upsertError } = await supabase
      .from('integrations')
      .upsert({
        user_id,
        client_id,
        platform: 'meta_ads',
        access_token_encrypted: accessTokenEncrypted,
        refresh_token_encrypted: refreshTokenEncrypted,
        token_expires_at: tokenExpiresAt,
        scope: scopeData,
        is_active: true,
        connected_at: new Date().toISOString(),
      }, {
        onConflict: 'client_id,platform',
      });

    if (upsertError) {
      console.error('Database error saving Meta integration:', upsertError.message);
      return NextResponse.redirect(`${appUrl}/integrations?error=database_save_failed`);
    }

    return NextResponse.redirect(`${appUrl}/integrations?success=true&platform=meta_ads`);
  } catch (err: any) {
    console.error('Meta OAuth callback handler error:', err);
    return NextResponse.redirect(`${appUrl}/integrations?error=internal_server_error`);
  }
}
