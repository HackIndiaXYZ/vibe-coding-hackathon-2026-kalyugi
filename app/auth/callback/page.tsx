'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoadingScreen } from '@/app/components/LoadingScreen';
import { AlertBanner } from '@/app/components/AlertBanner';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const next = searchParams.get('next') || '/dashboard';
    const oauthError = searchParams.get('error_description') || searchParams.get('error');

    if (oauthError) {
      setError(oauthError);
      return;
    }

    if (!code) {
      setError('Authorization code is missing. Please try signing in again.');
      return;
    }

    let cancelled = false;

    const completeSignIn = async () => {
      try {
        const response = await fetch('/api/auth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const result = await response.json();

        if (cancelled) return;

        if (!result.success || !result.data?.session?.access_token) {
          setError(result.error || 'Failed to complete sign in.');
          return;
        }

        localStorage.setItem('supabase_session_token', result.data.session.access_token);
        router.replace(next.startsWith('/') ? next : '/dashboard');
      } catch {
        if (!cancelled) {
          setError('Network error while completing sign in.');
        }
      }
    };

    completeSignIn();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  if (error) {
    return (
      <div className="flex min-h-screen min-h-[100dvh] w-full bg-background text-on-surface flex-col items-center justify-center gap-6 p-margin-mobile">
        <AlertBanner type="error" message={error} />
        <button type="button" onClick={() => router.replace('/')} className="btn btn-primary px-6 py-3">
          Back to Login
        </button>
      </div>
    );
  }

  return <LoadingScreen message="Completing sign in..." />;
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<LoadingScreen message="Completing sign in..." />}>
      <AuthCallbackContent />
    </Suspense>
  );
}
