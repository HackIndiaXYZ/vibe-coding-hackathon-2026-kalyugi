'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/app/components/AppShell';
import { LoadingScreen } from '@/app/components/LoadingScreen';
import { AlertBanner } from '@/app/components/AlertBanner';
import { FormField, inputClassName, selectClassName } from '@/app/components/FormField';

interface Client {
  id: string;
  name: string;
  industry?: string;
}

export default function GenerateReportPage() {
  const router = useRouter();
  
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [clientIntegrations, setClientIntegrations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionToken, setSessionToken] = useState<string>('');

  // Date inputs
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  // Selected platforms
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);

  // Inline Client Creation Modal/Form
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientIndustry, setNewClientIndustry] = useState('');
  const [creatingClient, setCreatingClient] = useState(false);

  // Generation Loading Overlay & Progress
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Alerts
  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 1. Check Session & Load Clients on mount
  useEffect(() => {
    const token = localStorage.getItem('supabase_session_token');
    if (!token) {
      router.push('/');
      return;
    }
    setSessionToken(token);
    
    // Set default date range to last month
    const today = new Date();
    const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    
    const formatDate = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };
    
    setPeriodStart(formatDate(firstDayLastMonth));
    setPeriodEnd(formatDate(lastDayLastMonth));

    loadClients(token);
  }, [router]);

  // 2. Fetch clients
  const loadClients = async (token: string, selectClientId?: string) => {
    try {
      setLoading(true);
      const response = await fetch('/api/clients', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const res = await response.json();
      if (res.success) {
        setClients(res.data);
        if (res.data.length > 0) {
          const defaultSelect = selectClientId || res.data[0].id;
          setSelectedClientId(defaultSelect);
        }
      }
    } catch (err) {
      console.error('Failed to load clients:', err);
      setAlertMsg({ type: 'error', text: 'Error fetching client list.' });
    } finally {
      setLoading(false);
    }
  };

  // 3. Fetch integrations when selected client changes
  useEffect(() => {
    if (!selectedClientId || !sessionToken) {
      setClientIntegrations([]);
      return;
    }

    const checkIntegrations = async () => {
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
            .select('platform')
            .eq('client_id', selectedClientId)
            .eq('is_active', true);
            
          if (!error && data) {
            const platforms = data.map(item => item.platform);
            setClientIntegrations(platforms);
            // Default select connected platforms
            setSelectedPlatforms(platforms);
          }
        }
      } catch (err) {
        console.error('Failed to verify client integrations:', err);
      }
    };

    checkIntegrations();
  }, [selectedClientId, sessionToken]);

  // 4. Handle Preset Date Ranges
  const handleDateShortcut = (range: 'last_month' | 'last_30_days' | 'this_month') => {
    const today = new Date();
    const formatDate = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    if (range === 'last_month') {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      setPeriodStart(formatDate(start));
      setPeriodEnd(formatDate(end));
    } else if (range === 'last_30_days') {
      const start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      setPeriodStart(formatDate(start));
      setPeriodEnd(formatDate(today));
    } else if (range === 'this_month') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      setPeriodStart(formatDate(start));
      setPeriodEnd(formatDate(today));
    }
  };

  // 5. Handle Platform Selection Toggle
  const togglePlatform = (platform: string) => {
    if (selectedPlatforms.includes(platform)) {
      setSelectedPlatforms(selectedPlatforms.filter(p => p !== platform));
    } else {
      setSelectedPlatforms([...selectedPlatforms, platform]);
    }
  };

  // 6. Handle Client Creation
  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName || !sessionToken) return;

    setCreatingClient(true);
    try {
      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newClientName,
          industry: newClientIndustry || undefined,
        }),
      });
      const res = await response.json();
      if (res.success && res.data) {
        setIsClientModalOpen(false);
        setNewClientName('');
        setNewClientIndustry('');
        setAlertMsg({ type: 'success', text: `Client '${res.data.name}' created successfully.` });
        // Reload list and auto select the new client
        loadClients(sessionToken, res.data.id);
      } else {
        setAlertMsg({ type: 'error', text: res.error || 'Failed to create client.' });
      }
    } catch (err) {
      console.error('Client creation error:', err);
      setAlertMsg({ type: 'error', text: 'Network error creating client profile.' });
    } finally {
      setCreatingClient(false);
    }
  };

  // 7. Trigger Report Generation & Progress Simulation
  const handleGenerateReport = async () => {
    if (!selectedClientId || selectedPlatforms.length === 0) {
      setAlertMsg({ type: 'error', text: 'Please select a client and at least one platform.' });
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setProgressPercent(0);
    setProgressText('Initiating performance compile sequence...');

    // Progress Simulation Timer
    let currentPercent = 0;
    const progressInterval = setInterval(() => {
      if (currentPercent < 90) {
        currentPercent += Math.floor(Math.random() * 5) + 2;
        if (currentPercent > 90) currentPercent = 90;
        setProgressPercent(currentPercent);
        
        // Dynamic labels based on range
        if (currentPercent < 20) {
          setProgressText('Initializing report record...');
        } else if (currentPercent < 45) {
          setProgressText('Querying analytics and ad platform APIs...');
        } else if (currentPercent < 75) {
          setProgressText('Engineering AI Executive Commentaries...');
        } else {
          setProgressText('Compiling PDF templates and uploading to Cloudflare R2...');
        }
      }
    }, 450);

    try {
      const response = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: selectedClientId,
          period_start: periodStart,
          period_end: periodEnd,
          platforms: selectedPlatforms,
        }),
      });

      clearInterval(progressInterval);
      const res = await response.json();

      if (res.success && res.data) {
        setProgressPercent(100);
        setProgressText('Report successfully compiled! Redirecting...');
        setTimeout(() => {
          router.push(`/reports/${res.data.report_id}`);
        }, 800);
      } else {
        setGenerationError(res.error || 'Failed to complete report generation orchestration.');
        setIsGenerating(false);
      }
    } catch (err: any) {
      clearInterval(progressInterval);
      setGenerationError(err.message || 'Critical network failure during report generation.');
      setIsGenerating(false);
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <>
    <AppShell activeNav="generate" title="Report Creator">
      <div className="page-container-narrow relative space-y-8">
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
        <div className="bg-orb w-[min(500px,80vw)] h-[min(500px,80vw)] bg-primary-container/10 top-[-100px] left-[-100px]"></div>
        <div className="bg-orb w-[min(600px,90vw)] h-[min(600px,90vw)] bg-secondary-container/5 bottom-[-200px] right-[-100px]"></div>
      </div>

      <div className="relative z-10 space-y-8">
            {alertMsg && (
              <AlertBanner type={alertMsg.type} message={alertMsg.text} onDismiss={() => setAlertMsg(null)} />
            )}

            {/* Error from generation if any */}
            {generationError && (
              <div className="bg-error-container/20 border border-error/50 p-5 rounded-xl text-error font-body-md text-sm flex items-start gap-3">
                <span className="material-symbols-outlined text-xl mt-0.5">error</span>
                <div>
                  <h4 className="font-bold">Generation Failed</h4>
                  <p className="mt-1">{generationError}</p>
                </div>
              </div>
            )}

            {/* Main Form Panel */}
            <div className="glass-card rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
              <div className="h-1.5 w-full bg-gradient-to-r from-primary to-secondary-container"></div>
              
              <div className="p-8 space-y-8">
                
                {/* Step 1: Select/Create Client */}
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <div>
                      <h3 className="font-headline-sm text-body-lg font-bold text-on-surface flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold font-label-caps">1</span>
                        Agency Client
                      </h3>
                      <p className="font-body-md text-xs text-on-surface-variant mt-1">Select the client profile for whom you want to run compiling metrics.</p>
                    </div>
                    <button 
                      onClick={() => setIsClientModalOpen(true)}
                      className="text-xs text-primary hover:underline font-label-caps text-label-caps flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[14px]">add_circle</span>
                      New Client
                    </button>
                  </div>
                  
                  {clients.length === 0 ? (
                    <div className="border border-dashed border-white/10 p-6 rounded-xl text-center space-y-3">
                      <p className="font-body-md text-sm text-on-surface-variant">No client profiles configured yet.</p>
                      <button 
                        onClick={() => setIsClientModalOpen(true)}
                        className="bg-primary/25 border border-primary/50 text-primary font-label-caps text-label-caps py-2 px-4 rounded-lg text-xs"
                      >
                        Create Client First
                      </button>
                    </div>
                  ) : (
                    <select 
                      value={selectedClientId} 
                      onChange={(e) => setSelectedClientId(e.target.value)}
                      className={selectClassName}
                      aria-label="Select client"
                    >
                      {clients.map(c => (
                        <option key={c.id} value={c.id} className="bg-surface">{c.name} {c.industry ? `(${c.industry})` : ''}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Step 2: Date range */}
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <div>
                      <h3 className="font-headline-sm text-body-lg font-bold text-on-surface flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold font-label-caps">2</span>
                        Reporting Period
                      </h3>
                      <p className="font-body-md text-xs text-on-surface-variant mt-1">Select the dates to run insights. Metric aggregations will align to this range.</p>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleDateShortcut('last_month')} 
                        className="text-[10px] bg-white/5 border border-white/10 text-on-surface-variant hover:text-white px-2 py-1 rounded transition-colors font-label-caps text-label-caps"
                      >
                        Last Month
                      </button>
                      <button 
                        onClick={() => handleDateShortcut('last_30_days')} 
                        className="text-[10px] bg-white/5 border border-white/10 text-on-surface-variant hover:text-white px-2 py-1 rounded transition-colors font-label-caps text-label-caps"
                      >
                        Last 30 Days
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField id="period-start" label="Start Date">
                      <input 
                        id="period-start"
                        type="date" 
                        value={periodStart} 
                        onChange={(e) => setPeriodStart(e.target.value)}
                        className={inputClassName}
                      />
                    </FormField>
                    <FormField id="period-end" label="End Date">
                      <input 
                        id="period-end"
                        type="date" 
                        value={periodEnd} 
                        onChange={(e) => setPeriodEnd(e.target.value)}
                        className={inputClassName}
                      />
                    </FormField>
                  </div>
                </div>

                {/* Step 3: Platform selection */}
                <div className="space-y-4">
                  <div>
                    <h3 className="font-headline-sm text-body-lg font-bold text-white flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold font-label-caps">3</span>
                      Data Platforms
                    </h3>
                    <p className="font-body-md text-xs text-on-surface-variant mt-1">Check the active channels to fetch. Requires connected integrations.</p>
                  </div>

                  {clients.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      
                      {/* GA4 Selection */}
                      <div 
                        onClick={() => togglePlatform('ga4')}
                        className={`p-4 rounded-xl border transition-all cursor-pointer flex justify-between items-center ${selectedPlatforms.includes('ga4') ? 'bg-primary/5 border-primary shadow-[0_0_15px_rgba(14,165,233,0.15)]' : 'bg-black/20 border-white/5 opacity-70 hover:opacity-100'}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined icon-platform-ga4">query_stats</span>
                          <div>
                            <p className="font-headline-sm text-sm text-on-surface font-bold">Google Analytics 4</p>
                            <span className={`text-[9px] font-label-caps ${clientIntegrations.includes('ga4') ? 'text-secondary-container' : 'text-error'}`}>
                              {clientIntegrations.includes('ga4') ? '✓ INTEGRATED' : '⚠ NO INTEGRATION'}
                            </span>
                          </div>
                        </div>
                        <input 
                          type="checkbox" 
                          checked={selectedPlatforms.includes('ga4')} 
                          onChange={() => {}} // Controlled click on container
                          className="rounded bg-black border-white/20 text-primary-container focus:ring-primary-container"
                        />
                      </div>

                      {/* Google Ads Selection */}
                      <div 
                        onClick={() => togglePlatform('google_ads')}
                        className={`p-4 rounded-xl border transition-all cursor-pointer flex justify-between items-center ${selectedPlatforms.includes('google_ads') ? 'bg-primary/5 border-primary shadow-[0_0_15px_rgba(14,165,233,0.15)]' : 'bg-black/20 border-white/5 opacity-70 hover:opacity-100'}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined icon-platform-google">ads_click</span>
                          <div>
                            <p className="font-headline-sm text-sm text-on-surface font-bold">Google Ads</p>
                            <span className={`text-[9px] font-label-caps ${clientIntegrations.includes('google_ads') ? 'text-secondary-container' : 'text-error'}`}>
                              {clientIntegrations.includes('google_ads') ? '✓ INTEGRATED' : '⚠ NO INTEGRATION'}
                            </span>
                          </div>
                        </div>
                        <input 
                          type="checkbox" 
                          checked={selectedPlatforms.includes('google_ads')} 
                          onChange={() => {}} 
                          className="rounded bg-black border-white/20 text-primary-container focus:ring-primary-container"
                        />
                      </div>

                      {/* Meta Ads Selection */}
                      <div 
                        onClick={() => togglePlatform('meta_ads')}
                        className={`p-4 rounded-xl border transition-all cursor-pointer flex justify-between items-center ${selectedPlatforms.includes('meta_ads') ? 'bg-primary/5 border-primary shadow-[0_0_15px_rgba(14,165,233,0.15)]' : 'bg-black/20 border-white/5 opacity-70 hover:opacity-100'}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined icon-platform-meta">group</span>
                          <div>
                            <p className="font-headline-sm text-sm text-on-surface font-bold">Meta Ads Manager</p>
                            <span className={`text-[9px] font-label-caps ${clientIntegrations.includes('meta_ads') ? 'text-secondary-container' : 'text-error'}`}>
                              {clientIntegrations.includes('meta_ads') ? '✓ INTEGRATED' : '⚠ NO INTEGRATION'}
                            </span>
                          </div>
                        </div>
                        <input 
                          type="checkbox" 
                          checked={selectedPlatforms.includes('meta_ads')} 
                          onChange={() => {}} 
                          className="rounded bg-black border-white/20 text-primary-container focus:ring-primary-container"
                        />
                      </div>

                      {/* Search Console Selection */}
                      <div 
                        onClick={() => togglePlatform('search_console')}
                        className={`p-4 rounded-xl border transition-all cursor-pointer flex justify-between items-center ${selectedPlatforms.includes('search_console') ? 'bg-primary/5 border-primary shadow-[0_0_15px_rgba(14,165,233,0.15)]' : 'bg-black/20 border-white/5 opacity-70 hover:opacity-100'}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined icon-platform-seo">travel_explore</span>
                          <div>
                            <p className="font-headline-sm text-sm text-on-surface font-bold">Search Console</p>
                            <span className={`text-[9px] font-label-caps ${clientIntegrations.includes('search_console') ? 'text-secondary-container' : 'text-error'}`}>
                              {clientIntegrations.includes('search_console') ? '✓ INTEGRATED' : '⚠ NO INTEGRATION'}
                            </span>
                          </div>
                        </div>
                        <input 
                          type="checkbox" 
                          checked={selectedPlatforms.includes('search_console')} 
                          onChange={() => {}} 
                          className="rounded bg-black border-white/20 text-primary-container focus:ring-primary-container"
                        />
                      </div>

                    </div>
                  )}
                  
                  {clients.length > 0 && selectedPlatforms.some(p => !clientIntegrations.includes(p)) && (
                    <div className="bg-error-container/20 border border-error/30 p-3 rounded-lg flex items-center gap-2 text-xs text-error font-body-md">
                      <span className="material-symbols-outlined text-[16px]">info</span>
                      You've selected a platform that is not integrated for this client. 
                      <a href="/integrations" className="underline font-bold text-error hover:text-red-300 ml-1">Connect integration</a>
                    </div>
                  )}
                </div>

                {/* Submit trigger button */}
                <button 
                  type="button"
                  onClick={handleGenerateReport}
                  disabled={clients.length === 0 || selectedPlatforms.length === 0 || isGenerating}
                  className="btn btn-primary w-full py-4 mt-8 font-headline-sm normal-case tracking-normal text-base rounded-xl"
                >
                  {isGenerating ? (
                    <>
                      <span className="material-symbols-outlined text-[22px] animate-spin">sync</span>
                      Compiling...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[22px]">smart_toy</span>
                      Compile AI Report & PDF
                    </>
                  )}
                </button>

              </div>
            </div>

      </div>
      </div>
    </AppShell>

      {isClientModalOpen && (
        <div className="fixed inset-0 modal-overlay flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setIsClientModalOpen(false)} aria-label="Close modal" />
          <form 
            onSubmit={handleCreateClient}
            className="glass-card modal-content w-full max-w-md relative rounded-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden"
          >
            <div className="h-1 w-full bg-gradient-to-r from-primary-container to-secondary-container"></div>
            <div className="p-8 space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center border border-white/10 shadow-inner">
                  <span className="material-symbols-outlined text-primary-container">group_add</span>
                </div>
                <div>
                  <h2 className="font-headline-sm text-[22px] text-on-surface leading-tight">Create Client Profile</h2>
                  <p className="font-data-sm text-[13px] text-on-surface-variant mt-1">Configure client details inside the system</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <FormField id="client-name" label="Client Company Name">
                  <input
                    id="client-name"
                    required
                    className={inputClassName}
                    placeholder="e.g. Reliance Retail"
                    type="text"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    disabled={creatingClient}
                  />
                </FormField>
                
                <FormField id="client-industry" label="Industry Segment (Optional)">
                  <input
                    id="client-industry"
                    className={inputClassName}
                    placeholder="e.g. E-commerce / Fashion"
                    type="text"
                    value={newClientIndustry}
                    onChange={(e) => setNewClientIndustry(e.target.value)}
                    disabled={creatingClient}
                  />
                </FormField>
              </div>
              
              <div className="flex gap-4">
                <button 
                  disabled={creatingClient}
                  type="button"
                  className="btn btn-ghost flex-1 py-3"
                  onClick={() => setIsClientModalOpen(false)}
                >
                  Cancel
                </button>
                <button 
                  disabled={creatingClient || !newClientName.trim()}
                  type="submit"
                  className="btn btn-secondary flex-1 py-3"
                >
                  {creatingClient ? (
                    <>
                      <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                      Creating...
                    </>
                  ) : (
                    'Create Client'
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Generation Loader Progress Overlay */}
      {isGenerating && (
        <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-lg flex flex-col items-center justify-center p-4 sm:p-8" role="dialog" aria-modal="true" aria-busy="true" aria-label="Generating report">
          <div className="w-full max-w-md space-y-8 text-center">
            
            {/* Spinning AI Orb */}
            <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
              <svg className="absolute inset-0 w-full h-full animate-[spin_4s_linear_infinite]" viewBox="0 0 100 100">
                <circle className="text-primary/20" cx="50" cy="50" fill="none" r="46" stroke="currentColor" strokeDasharray="5 15" strokeWidth="2"></circle>
                <circle className="text-primary" cx="50" cy="50" fill="none" r="46" stroke="currentColor" strokeDasharray="80 200" strokeLinecap="round" strokeWidth="3"></circle>
              </svg>
              <span className="material-symbols-outlined text-primary text-4xl animate-pulse" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
            </div>

            <div className="space-y-3">
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-extrabold text-glow">Compiling Performance Report</h2>
              <p className="font-body-md text-sm text-on-surface-variant h-8">{progressText}</p>
            </div>

            {/* Progress bar container */}
            <div className="space-y-2">
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                <div 
                  className="h-full bg-gradient-to-r from-primary to-secondary-container transition-all duration-300 ease-out"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-[11px] font-label-caps text-outline">
                <span>ORCHESTRATING IN MEMORY</span>
                <span>{progressPercent}%</span>
              </div>
            </div>

          </div>
        </div>
      )}

    </>
  );
}
