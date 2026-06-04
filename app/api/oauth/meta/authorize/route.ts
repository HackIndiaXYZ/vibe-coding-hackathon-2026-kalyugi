export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import jwt from 'jsonwebtoken';

/**
 * GET /api/oauth/meta/authorize
 * Starts Meta (Facebook) OAuth flow.
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

    // Verify token with Supabase
    const supabase = getSupabaseClient(token);
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid token or expired session.' },
        { status: 401 }
      );
    }

    const platform = searchParams.get('platform') || 'meta_ads';
    const identifier = searchParams.get('identifier') || '';

    // Create state payload (platform is meta_ads for Meta OAuth)
    const statePayload = {
      client_id: clientId,
      user_id: user.id,
      platform,
      identifier,
    };

    // Sign the state
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY environment variable is not defined.');
    }
    
    const stateToken = jwt.sign(statePayload, encryptionKey, { expiresIn: '15m' });

    // Build Facebook OAuth authorization URL
    const metaAppId = process.env.META_APP_ID;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const redirectUri = `${appUrl}/api/oauth/meta/callback`;

    if (!metaAppId || metaAppId === 'your-meta-app-id') {
      const mockCallbackUrl = `${redirectUri}?code=mock_meta_code&state=${stateToken}`;
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

    const scopes = ['ads_read', 'read_insights'].join(',');

    const authUrl = new URL('https://www.facebook.com/v19.0/dialog/oauth');
    authUrl.searchParams.append('client_id', metaAppId || '');
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('state', stateToken);
    authUrl.searchParams.append('scope', scopes);

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
    console.error('Meta OAuth authorize error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error during Meta OAuth authorization.' },
      { status: 500 }
    );
  }
}
