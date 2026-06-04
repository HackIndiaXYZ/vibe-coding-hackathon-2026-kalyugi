export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/client';
import { encryptToken } from '@/lib/encryption';
import jwt from 'jsonwebtoken';

/**
 * GET /api/oauth/google/callback
 * Handles Google OAuth callback redirect.
 * Exchanges auth code for tokens, encrypts them, and saves to database.
 */
export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      console.error('Google OAuth callback error parameter:', errorParam);
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
      console.error('State token verification failed:', err.message);
      return NextResponse.redirect(`${appUrl}/integrations?error=invalid_state_token`);
    }

    const { client_id, user_id, platform, identifier } = decodedState;

    if (!client_id || !user_id || !platform) {
      return NextResponse.redirect(`${appUrl}/integrations?error=corrupted_state_payload`);
    }

    let accessToken = 'mock_google_access_token';
    let refreshToken = 'mock_google_refresh_token';
    let expiresIn = 3600;
    let scope = 'https://www.googleapis.com/auth/analytics.readonly';

    if (code !== 'mock_google_code') {
      // 2. Exchange code for Google Access/Refresh tokens
      const googleClientId = process.env.GOOGLE_CLIENT_ID;
      const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const redirectUri = `${appUrl}/api/oauth/google/callback`;

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: googleClientId,
          client_secret: googleClientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('Failed to exchange code for Google token:', errorText);
        return NextResponse.redirect(`${appUrl}/integrations?error=token_exchange_failed`);
      }

      const tokens = await tokenResponse.json();
      accessToken = tokens.access_token;
      refreshToken = tokens.refresh_token;
      expiresIn = tokens.expires_in || 3600;
      scope = tokens.scope || '';
    }
    
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // 3. Encrypt the tokens
    const accessTokenEncrypted = encryptToken(accessToken);
    let refreshTokenEncrypted = refreshToken ? encryptToken(refreshToken) : null;

    // 4. Retrieve existing integration to preserve refresh token if Google didn't send a new one
    const supabase = getSupabaseServiceClient();

    if (!refreshTokenEncrypted) {
      const { data: existingInt } = await supabase
        .from('integrations')
        .select('refresh_token_encrypted')
        .eq('client_id', client_id)
        .eq('platform', platform)
        .single();
      
      if (existingInt) {
        refreshTokenEncrypted = existingInt.refresh_token_encrypted;
      } else {
        // If it's a new integration and we don't have a refresh token, redirect with error
        return NextResponse.redirect(`${appUrl}/integrations?error=missing_refresh_token_force_consent`);
      }
    }

    const scopeData = JSON.stringify({
      scope,
      identifier: identifier || '',
    });

    // 5. Upsert Google integration into database
    const { error: upsertError } = await supabase
      .from('integrations')
      .upsert({
        user_id,
        client_id,
        platform,
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
      console.error('Database error upserting Google integration:', upsertError.message);
      return NextResponse.redirect(`${appUrl}/integrations?error=database_save_failed`);
    }

    return NextResponse.redirect(`${appUrl}/integrations?success=true&platform=${platform}`);
  } catch (err: any) {
    console.error('Google OAuth callback handler error:', err);
    return NextResponse.redirect(`${appUrl}/integrations?error=internal_server_error`);
  }
}
