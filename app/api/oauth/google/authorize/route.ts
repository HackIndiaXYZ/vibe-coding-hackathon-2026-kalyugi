export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import jwt from 'jsonwebtoken';

/**
 * GET /api/oauth/google/authorize
 * Starts Google OAuth flow.
 * Expects client_id and auth token (either via Authorization header or ?token= query parameter).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get('client_id');
    const redirectParam = searchParams.get('redirect') === 'true';

    if (!clientId) {
      return NextResponse.json(
        { success: false, error: 'client_id query parameter is required.' },
        { status: 400 }
      );
    }

    // Extract auth token
    let token = req.headers.get('authorization')?.substring(7);
    if (!token) {
      token = searchParams.get('token') || undefined;
    }

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Authentication token is required.' },
        { status: 401 }
      );
    }

    // Verify token with Supabase to get user details
    const supabase = getSupabaseClient(token);
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid token or expired session.' },
        { status: 401 }
      );
    }

    const platform = searchParams.get('platform') || 'google_ads';
    const identifier = searchParams.get('identifier') || '';

    // Create state payload with client_id + user_id + platform + identifier
    const statePayload = {
      client_id: clientId,
      user_id: user.id,
      platform,
      identifier,
    };

    // Sign the state as a 15-minute JWT using the encryption key
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY environment variable is not defined.');
    }
    
    const stateToken = jwt.sign(statePayload, encryptionKey, { expiresIn: '15m' });

    // Build Google OAuth authorization URL
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const redirectUri = `${appUrl}/api/oauth/google/callback`;

    if (!googleClientId || googleClientId === 'your-google-client-id') {
      const mockCallbackUrl = `${redirectUri}?code=mock_google_code&state=${stateToken}`;
      if (redirectParam) {
        return NextResponse.redirect(mockCallbackUrl);
      }
      return NextResponse.json({
        success: true,
        data: {
          url: mockCallbackUrl,
        },
      });
    }

    const scopes = [
      'https://www.googleapis.com/auth/analytics.readonly',
      'https://www.googleapis.com/auth/adwords',
      'https://www.googleapis.com/auth/webmasters.readonly',
    ].join(' ');

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.append('client_id', googleClientId || '');
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', scopes);
    authUrl.searchParams.append('state', stateToken);
    authUrl.searchParams.append('access_type', 'offline');
    authUrl.searchParams.append('prompt', 'consent'); // Force Google to return a refresh token

    if (redirectParam) {
      return NextResponse.redirect(authUrl.toString());
    }

    return NextResponse.json({
      success: true,
      data: {
        url: authUrl.toString(),
      },
    });
  } catch (err: any) {
    console.error('Google OAuth authorize error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error during Google OAuth authorization.' },
      { status: 500 }
    );
  }
}
