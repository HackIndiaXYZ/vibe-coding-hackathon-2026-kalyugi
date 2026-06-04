'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/app/components/AppShell';
import { LoadingScreen } from '@/app/components/LoadingScreen';
import { AlertBanner } from '@/app/components/AlertBanner';
import { FormField, inputClassName, selectClassName } from '@/app/components/FormField';

interface Client {
  id: string;
  name: string;
}

interface Integration {
  id: string;
  platform: 'meta_ads' | 'google_ads' | 'ga4' | 'search_console';
  connected_at: string;
  is_active: boolean;
}

function IntegrationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionToken, setSessionToken] = useState<string>('');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [targetPlatform, setTargetPlatform] = useState<'meta_ads' | 'google_ads' | 'ga4' | 'search_console' | null>(null);
  const [targetPlatformLabel, setTargetPlatformLabel] = useState('');
  const [identifierInput, setIdentifierInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  
  // Alert states
  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 1. Load clients and check URL query parameters for connection success/error callbacks
  useEffect(() => {
    const token = localStorage.getItem('supabase_session_token');
    if (!token) {
      router.push('/');
      return;
    }
    setSessionToken(token);

    const loadClients = async () => {
      try {
        const response = await fetch('/api/clients', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (data.success && data.data.length > 0) {
          setClients(data.data);
          setSelectedClientId(data.data[0].id);
        }
      } catch (err) {
        console.error('Failed to load clients:', err);
      } finally {
        setLoading(false);
      }
    };

    loadClients();

    // Check query params for callbacks
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    const platform = searchParams.get('platform');
    
    if (success === 'true') {
      setAlertMsg({
        type: 'success',
        text: `Successfully integrated with ${platform === 'meta_ads' ? 'Meta Ads' : platform?.toUpperCase()}!`,
      });
      // Clear URL params
      router.replace('/integrations');
    } else if (error) {
      setAlertMsg({
        type: 'error',
        text: `Integration failed: ${error.replace(/_/g, ' ')}`,
      });
      router.replace('/integrations');
    }
  }, [router, searchParams]);

  // 2. Fetch integrations when selected client changes
  useEffect(() => {
    if (!selectedClientId || !sessionToken) return;

    const fetchIntegrations = async () => {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (supabaseUrl && supabaseKey) {
          const { createClient } = await import('@supabase/supabase-js');
          const supabase = createClient(supabaseUrl, supabaseKey, {
            global: { headers: { Authorization: `Bearer ${sessionToken}` } }
          });
          
          const { data, error } = await supabase
            .from('integrations')
            .select('id, platform, connected_at, is_active')
            .eq('client_id', selectedClientId);
            
          if (!error && data) {
            setIntegrations(data);
          }
        }
      } catch (err) {
        console.error('Failed to load client integrations:', err);
      }
    };

    fetchIntegrations();
  }, [selectedClientId, sessionToken]);

  // 3. Trigger OAuth Redirect
  const handleConnect = async () => {
    if (!targetPlatform || !selectedClientId || !identifierInput) return;

    setConnecting(true);
    try {
      const platformPath = targetPlatform === 'meta_ads' ? 'meta' : 'google';
      const appUrl = window.location.origin;
      
      // Redirect to authorization route
      // We pass the token, client_id, platform configuration details
      const authUrl = `${appUrl}/api/oauth/${platformPath}/authorize?client_id=${selectedClientId}&platform=${targetPlatform}&identifier=${encodeURIComponent(identifierInput)}&redirect=true&token=${sessionToken}`;
      
      window.location.href = authUrl;
    } catch (err) {
      console.error('OAuth connection error:', err);
      setConnecting(false);
      setIsModalOpen(false);
      setAlertMsg({ type: 'error', text: 'Failed to initiate authentication flow.' });
    }
  };

  const openConnectionModal = (platform: 'meta_ads' | 'google_ads' | 'ga4' | 'search_console', label: string) => {
    setTargetPlatform(platform);
    setTargetPlatformLabel(label);
    setIdentifierInput('');
    setIsModalOpen(true);
  };

  if (loading) {
    return <LoadingScreen />;
  }

  // Check integration status helpers
  const getIntegration = (platform: string) => integrations.find(i => i.platform === platform);
  const isConnected = (platform: string) => getIntegration(platform) !== undefined;

  return (
    <>
    <AppShell activeNav="integrations" title="Data Sources">
          <div className="relative space-y-8">
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
              <div className="bg-orb w-[min(500px,80vw)] h-[min(500px,80vw)] bg-primary-container/20 top-[-100px] left-[-100px]"></div>
              <div className="bg-orb w-[min(600px,90vw)] h-[min(600px,90vw)] bg-secondary-container/10 bottom-[-200px] right-[-100px]"></div>
            </div>

            <div className="relative z-10 space-y-8">
            {alertMsg && (
              <AlertBanner type={alertMsg.type} message={alertMsg.text} onDismiss={() => setAlertMsg(null)} />
            )}

            {/* Client selector */}
            <div className="glass-panel p-6 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="font-headline-sm text-body-lg font-bold text-on-surface">Select Agency Client</h3>
                <p className="font-body-md text-sm text-on-surface-variant mt-1">Configure integrations individually for each of your client accounts.</p>
              </div>
              <div className="relative w-full md:w-64">
                {clients.length === 0 ? (
                  <button 
                    type="button"
                    onClick={() => router.push('/reports/generate')}
                    className="btn btn-primary w-full py-2.5"
                  >
                    Create Client First
                  </button>
                ) : (
                  <select 
                    value={selectedClientId} 
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className={selectClassName}
                    aria-label="Select client"
                  >
                    {clients.map(c => (
                      <option key={c.id} value={c.id} className="bg-surface">{c.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Section Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/5 pb-6">
              <div>
                <h3 className="font-headline-sm text-headline-sm text-on-surface">Available Integrations</h3>
                <p className="font-body-md text-body-md text-on-surface-variant mt-2 max-w-2xl">Connect your primary data sources to power the AI reporting engine. Supported platforms feature real-time sync and multi-dimensional analysis capabilities.</p>
              </div>
            </div>

            {/* Integrations Grid */}
            {clients.length === 0 ? (
              <div className="text-center p-12 glass-panel rounded-xl">
                <p className="text-on-surface-variant">Please create a client on your Dashboard first to configure data integrations.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 lg:gap-8">
                
                {/* Card 1: GA4 */}
                <div className="glass-card rounded-xl p-6 flex flex-col gap-6 glow-hover group transition-transform duration-200">
                  <div className="flex justify-between items-start">
                    <div className="w-14 h-14 rounded-xl bg-platform-ga4 flex items-center justify-center shadow-lg border border-white/10 p-2.5">
                      <svg className="w-full h-full" fill="white" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm4 0h-2V7h2v10z"></path></svg>
                    </div>
                    {isConnected('ga4') ? (
                      <div className="connected-badge px-3 py-1.5 rounded-full flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-secondary-container animate-dot-pulse"></span>
                        <span className="font-label-caps text-[10px] text-secondary-container tracking-wider">Connected</span>
                      </div>
                    ) : (
                      <span className="font-label-caps text-[10px] text-outline bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">Inactive</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-headline-sm text-[20px] text-on-surface mb-2">Google Analytics 4</h4>
                    <p className="font-body-md text-sm text-on-surface-variant line-clamp-2">Web and app traffic, event tracking, user journey analysis, and conversion funnels.</p>
                  </div>
                  <div className="pt-4 border-t border-white/5 flex items-center justify-between mt-auto">
                    {isConnected('ga4') ? (
                      <span className="font-data-sm text-xs text-on-surface-variant">Connected successfully</span>
                    ) : (
                      <button 
                        onClick={() => openConnectionModal('ga4', 'Google Analytics 4')}
                        className="btn btn-secondary w-full py-2.5"
                      >
                        Connect Account
                      </button>
                    )}
                  </div>
                </div>

                {/* Card 2: Google Ads */}
                <div className="glass-card rounded-xl p-6 flex flex-col gap-6 glow-hover group transition-transform duration-200">
                  <div className="flex justify-between items-start">
                    <div className="w-14 h-14 rounded-xl bg-platform-google flex items-center justify-center shadow-lg border border-white/10 p-2.5 relative overflow-hidden">
                      <div className="absolute inset-0 bg-white/10 rotate-45 transform translate-x-4"></div>
                      <span className="font-display-lg text-[24px] text-white font-bold leading-none">Ad</span>
                    </div>
                    {isConnected('google_ads') ? (
                      <div className="connected-badge px-3 py-1.5 rounded-full flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-secondary-container animate-dot-pulse"></span>
                        <span className="font-label-caps text-[10px] text-secondary-container tracking-wider">Connected</span>
                      </div>
                    ) : (
                      <span className="font-label-caps text-[10px] text-outline bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">Inactive</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-headline-sm text-[20px] text-on-surface mb-2">Google Ads</h4>
                    <p className="font-body-md text-sm text-on-surface-variant line-clamp-2">Campaign performance, CPC metrics, conversion tracking, and keyword analysis.</p>
                  </div>
                  <div className="pt-4 border-t border-white/5 flex items-center justify-between mt-auto">
                    {isConnected('google_ads') ? (
                      <span className="font-data-sm text-xs text-on-surface-variant">Connected successfully</span>
                    ) : (
                      <button 
                        onClick={() => openConnectionModal('google_ads', 'Google Ads')}
                        className="btn btn-secondary w-full py-2.5"
                      >
                        Connect Account
                      </button>
                    )}
                  </div>
                </div>

                {/* Card 3: Meta Ads */}
                <div className="glass-card rounded-xl p-6 flex flex-col gap-6 glow-hover group transition-transform duration-200">
                  <div className="flex justify-between items-start">
                    <div className="w-14 h-14 rounded-xl bg-platform-meta flex items-center justify-center shadow-lg border border-white/10 p-2.5">
                      <span className="font-display-lg text-[24px] text-white font-bold leading-none">M</span>
                    </div>
                    {isConnected('meta_ads') ? (
                      <div className="connected-badge px-3 py-1.5 rounded-full flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-secondary-container animate-dot-pulse"></span>
                        <span className="font-label-caps text-[10px] text-secondary-container tracking-wider">Connected</span>
                      </div>
                    ) : (
                      <span className="font-label-caps text-[10px] text-outline bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">Inactive</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-headline-sm text-[20px] text-on-surface mb-2">Meta Ads Manager</h4>
                    <p className="font-body-md text-sm text-on-surface-variant line-clamp-2">Social campaign metrics, demographic insights, ROAS, and custom audience tracking.</p>
                  </div>
                  <div className="pt-4 border-t border-white/5 flex items-center justify-between mt-auto">
                    {isConnected('meta_ads') ? (
                      <span className="font-data-sm text-xs text-on-surface-variant">Connected successfully</span>
                    ) : (
                      <button 
                        onClick={() => openConnectionModal('meta_ads', 'Meta Ads')}
                        className="btn btn-secondary w-full py-2.5"
                      >
                        Connect Account
                      </button>
                    )}
                  </div>
                </div>

                {/* Card 4: Search Console */}
                <div className="glass-card rounded-xl p-6 flex flex-col gap-6 glow-hover group transition-transform duration-200">
                  <div className="flex justify-between items-start">
                    <div className="w-14 h-14 rounded-xl bg-platform-search flex items-center justify-center shadow-lg border border-white/10 p-2.5">
                      <span className="material-symbols-outlined text-white text-[32px]">travel_explore</span>
                    </div>
                    {isConnected('search_console') ? (
                      <div className="connected-badge px-3 py-1.5 rounded-full flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-secondary-container animate-dot-pulse"></span>
                        <span className="font-label-caps text-[10px] text-secondary-container tracking-wider">Connected</span>
                      </div>
                    ) : (
                      <span className="font-label-caps text-[10px] text-outline bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">Inactive</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-headline-sm text-[20px] text-on-surface mb-2">Google Search Console</h4>
                    <p className="font-body-md text-sm text-on-surface-variant line-clamp-2">Organic search performance, indexing status, keyword rankings, and technical SEO metrics.</p>
                  </div>
                  <div className="pt-4 border-t border-white/5 flex items-center justify-between mt-auto">
                    {isConnected('search_console') ? (
                      <span className="font-data-sm text-xs text-on-surface-variant">Connected successfully</span>
                    ) : (
                      <button 
                        onClick={() => openConnectionModal('search_console', 'Search Console')}
                        className="btn btn-secondary w-full py-2.5"
                      >
                        Connect Account
                      </button>
                    )}
                  </div>
                </div>

              </div>
            )}
            </div>
          </div>
    </AppShell>

      {isModalOpen && (
        <div className="fixed inset-0 modal-overlay flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setIsModalOpen(false)} aria-label="Close modal" />
          <div className="glass-card modal-content w-full max-w-md relative rounded-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-primary-container to-secondary-container"></div>
            <div className="p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center border border-white/10 shadow-inner">
                  <span className="material-symbols-outlined text-primary-container">link</span>
                </div>
                <div>
                  <h2 className="font-headline-sm text-[22px] text-on-surface leading-tight">Connect {targetPlatformLabel}</h2>
                  <p className="font-data-sm text-[13px] text-on-surface-variant mt-1">Platform Account Configuration</p>
                </div>
              </div>
              
              <div className="space-y-4 mb-8">
                <p className="font-body-md text-sm text-on-surface-variant">
                  Please enter the account or property identifier below to link it to this client profile:
                </p>
                
                <FormField
                  id="platform-identifier"
                  label={
                    targetPlatform === 'ga4' ? 'GA4 Property ID' :
                    targetPlatform === 'google_ads' ? 'Google Ads Customer ID' :
                    targetPlatform === 'meta_ads' ? 'Meta Ad Account ID' :
                    'Search Console Site URL'
                  }
                  error={!identifierInput.trim() && connecting ? 'Identifier is required.' : undefined}
                >
                  <input
                    id="platform-identifier"
                    className={inputClassName}
                    placeholder={
                      targetPlatform === 'ga4' ? 'e.g. 293810482' :
                      targetPlatform === 'google_ads' ? 'e.g. 849-301-4921' :
                      targetPlatform === 'meta_ads' ? 'e.g. act_2391048201' :
                      'e.g. https://www.yourdomain.com'
                    }
                    type="text"
                    value={identifierInput}
                    onChange={(e) => setIdentifierInput(e.target.value)}
                    disabled={connecting}
                    aria-invalid={!identifierInput.trim()}
                  />
                </FormField>
              </div>
              
              <div className="flex gap-4">
                <button 
                  type="button"
                  disabled={connecting}
                  className="btn btn-ghost flex-1 py-3"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  disabled={connecting || !identifierInput.trim()}
                  className="btn btn-secondary flex-1 py-3"
                  onClick={handleConnect}
                >
                  {connecting ? (
                    <>
                      <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                      Redirecting...
                    </>
                  ) : (
                    'Link & Authorize'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <IntegrationsContent />
    </Suspense>
  );
}
