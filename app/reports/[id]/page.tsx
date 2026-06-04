'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { AppShell } from '@/app/components/AppShell';
import { LoadingScreen } from '@/app/components/LoadingScreen';
import { AlertBanner } from '@/app/components/AlertBanner';
import { FormField, inputClassName, textareaClassName } from '@/app/components/FormField';

interface Section {
  id: string;
  platform: 'meta_ads' | 'google_ads' | 'ga4' | 'search_console';
  metrics: any;
  ai_commentary: string;
  is_visible: boolean;
}

interface Client {
  id: string;
  name: string;
  industry?: string;
  logo_url?: string;
}

interface Report {
  id: string;
  client_id: string;
  period_start: string;
  period_end: string;
  status: 'draft' | 'generating' | 'ready' | 'sent' | 'failed';
  pdf_url?: string;
  pdf_key?: string;
  ai_summary: string;
  metrics_snapshot?: any;
  created_at: string;
  generated_at?: string;
  sent_at?: string;
  client: Client;
  sections: Section[];
}

export default function ReportDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionToken, setSessionToken] = useState<string>('');

  // Editing states
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryInput, setSummaryInput] = useState('');
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionCommentaryInput, setSectionCommentaryInput] = useState('');
  const [savingAction, setSavingAction] = useState<string | null>(null); // 'summary' or section platform name

  // Modal states
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailForm, setEmailForm] = useState({ email: '', name: '', message: '' });
  const [sendingEmail, setSendingEmail] = useState(false);

  const [isWhatsappModalOpen, setIsWhatsappModalOpen] = useState(false);
  const [whatsappTemplate, setWhatsappTemplate] = useState('');
  const [whatsappLoading, setWhatsappLoading] = useState(false);

  const [deleting, setDeleting] = useState(false);
  
  // Alert states
  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadReport = useCallback(async (token: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/reports/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const res = await response.json();
      if (res.success) {
        setReport(res.data);
        setSummaryInput(res.data.ai_summary || '');
      } else {
        setAlertMsg({ type: 'error', text: res.error || 'Failed to retrieve report details.' });
      }
    } catch (err) {
      console.error('Failed to load report:', err);
      setAlertMsg({ type: 'error', text: 'Error fetching report details from API.' });
    } finally {
      setLoading(false);
    }
  }, [id]);

  // 1. Load Session & Report Data
  useEffect(() => {
    const token = localStorage.getItem('supabase_session_token');
    if (!token) {
      router.push('/');
      return;
    }
    setSessionToken(token);
    loadReport(token);
  }, [id, router, loadReport]);

  // 2. Handle PUT requests (updates summary or section commentary)
  const handleSaveSummary = async () => {
    if (!sessionToken || !report) return;
    setSavingAction('summary');
    try {
      const response = await fetch(`/api/reports/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ai_summary: summaryInput,
        }),
      });
      const res = await response.json();
      if (res.success) {
        setReport(res.data.report ? { ...res.data.report, sections: res.data.sections } : null);
        setEditingSummary(false);
        setAlertMsg({ type: 'success', text: 'Executive summary saved and PDF re-rendered successfully.' });
      } else {
        setAlertMsg({ type: 'error', text: res.error || 'Failed to update summary.' });
      }
    } catch (err) {
      console.error('Failed to save summary:', err);
      setAlertMsg({ type: 'error', text: 'Network error saving executive summary.' });
    } finally {
      setSavingAction(null);
    }
  };

  const handleSaveSectionCommentary = async (platform: string) => {
    if (!sessionToken || !report) return;
    setSavingAction(platform);
    try {
      const response = await fetch(`/api/reports/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          platform,
          ai_commentary: sectionCommentaryInput,
        }),
      });
      const res = await response.json();
      if (res.success) {
        setReport(res.data.report ? { ...res.data.report, sections: res.data.sections } : null);
        setEditingSectionId(null);
        setAlertMsg({ type: 'success', text: `${getPlatformLabel(platform)} commentary saved and PDF re-rendered.` });
      } else {
        setAlertMsg({ type: 'error', text: res.error || 'Failed to update platform commentary.' });
      }
    } catch (err) {
      console.error('Failed to save section commentary:', err);
      setAlertMsg({ type: 'error', text: 'Network error saving platform commentary.' });
    } finally {
      setSavingAction(null);
    }
  };

  // 3. Handle DELETE request
  const handleDeleteReport = async () => {
    const confirmDelete = window.confirm('Are you sure you want to permanently delete this report and its files? This action cannot be undone.');
    if (!confirmDelete) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/reports/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const res = await response.json();
      if (res.success) {
        router.push('/dashboard');
      } else {
        setAlertMsg({ type: 'error', text: res.error || 'Failed to purge report.' });
        setDeleting(false);
      }
    } catch (err) {
      console.error('Delete error:', err);
      setAlertMsg({ type: 'error', text: 'Network error purging report.' });
      setDeleting(false);
    }
  };

  // 4. Handle Email send modal submit
  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailForm.email || !emailForm.name) return;

    setSendingEmail(true);
    try {
      const response = await fetch(`/api/reports/${id}/send-email`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient_email: emailForm.email,
          recipient_name: emailForm.name,
          custom_message: emailForm.message || undefined,
        }),
      });
      const res = await response.json();
      if (res.success) {
        setIsEmailModalOpen(false);
        setEmailForm({ email: '', name: '', message: '' });
        setAlertMsg({ type: 'success', text: `Report successfully dispatched to ${emailForm.email}.` });
      } else {
        setAlertMsg({ type: 'error', text: res.error || 'Failed to dispatch email.' });
      }
    } catch (err) {
      console.error('Email send error:', err);
      setAlertMsg({ type: 'error', text: 'Network error sending report email.' });
    } finally {
      setSendingEmail(false);
    }
  };

  // 5. Handle WhatsApp link generate
  const handleOpenWhatsappModal = async () => {
    setIsWhatsappModalOpen(true);
    setWhatsappLoading(true);
    try {
      const response = await fetch(`/api/reports/${id}/whatsapp-link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const res = await response.json();
      if (res.success) {
        setWhatsappTemplate(res.data.message_template);
      } else {
        setAlertMsg({ type: 'error', text: res.error || 'Failed to generate WhatsApp template.' });
        setIsWhatsappModalOpen(false);
      }
    } catch (err) {
      console.error('WhatsApp error:', err);
      setAlertMsg({ type: 'error', text: 'Network error creating WhatsApp link.' });
      setIsWhatsappModalOpen(false);
    } finally {
      setWhatsappLoading(false);
    }
  };

  // Helper formatting functions
  const getPlatformLabel = (platform: string) => {
    switch (platform) {
      case 'ga4': return 'Google Analytics 4';
      case 'google_ads': return 'Google Ads';
      case 'meta_ads': return 'Meta Ads Manager';
      case 'search_console': return 'Google Search Console';
      default: return platform.toUpperCase();
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'ga4': return 'query_stats';
      case 'google_ads': return 'ads_click';
      case 'meta_ads': return 'group';
      case 'search_console': return 'travel_explore';
      default: return 'analytics';
    }
  };

  const getPlatformGradient = (platform: string) => {
    switch (platform) {
      case 'ga4': return 'bg-platform-ga4';
      case 'google_ads': return 'bg-platform-google';
      case 'meta_ads': return 'bg-platform-meta';
      case 'search_console': return 'bg-platform-seo';
      default: return 'bg-gradient-to-br from-primary-container to-primary';
    }
  };

  const formatPeriod = (startStr?: string, endStr?: string) => {
    if (!startStr || !endStr) return '';
    const start = new Date(startStr);
    const end = new Date(endStr);
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
    return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
  };

  if (loading) {
    return <LoadingScreen message="Loading Performance Report..." />;
  }

  if (!report) {
    return (
      <div className="flex min-h-screen min-h-[100dvh] w-full bg-background text-on-surface flex-col items-center justify-center gap-4 p-margin-mobile">
        <span className="material-symbols-outlined text-error text-5xl">warning</span>
        <p className="font-body-lg text-on-surface-variant text-center">Report could not be retrieved.</p>
        <button type="button" onClick={() => router.push('/dashboard')} className="btn btn-primary px-6 py-3">
          Return to Dashboard
        </button>
      </div>
    );
  }

  const headerActions = (
    <>
      {report.pdf_url && (
        <a 
          href={report.pdf_url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="btn btn-ghost py-2 px-3 sm:px-4 text-primary border-primary/20 hover:bg-primary-container hover:text-on-primary"
        >
          <span className="material-symbols-outlined text-[18px]">download</span>
          <span className="hidden sm:inline">Download</span>
        </a>
      )}
      <button 
        type="button"
        onClick={() => setIsEmailModalOpen(true)}
        className="btn btn-ghost py-2 px-3 sm:px-4"
      >
        <span className="material-symbols-outlined text-[18px]">mail</span>
        <span className="hidden sm:inline">Email</span>
      </button>
      <button 
        type="button"
        onClick={handleOpenWhatsappModal}
        className="btn btn-ghost py-2 px-3 sm:px-4 text-whatsapp border-whatsapp bg-whatsapp-muted"
      >
        <span className="material-symbols-outlined text-[18px]">share</span>
        <span className="hidden sm:inline">WhatsApp</span>
      </button>
      <button 
        type="button"
        disabled={deleting}
        onClick={handleDeleteReport}
        className="w-10 h-10 flex items-center justify-center rounded-lg text-outline hover:text-error hover:bg-error/10 border border-transparent hover:border-error/20 transition-colors disabled:opacity-50"
        aria-label="Delete report"
      >
        <span className={`material-symbols-outlined text-[20px] ${deleting ? 'animate-spin' : ''}`}>{deleting ? 'sync' : 'delete'}</span>
      </button>
    </>
  );

  return (
    <>
    <AppShell
      activeNav="dashboard"
      title={report.client.name}
      showBack
      headerActions={headerActions}
    >
          <div className="max-w-6xl mx-auto space-y-8 relative">
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
              <div className="bg-orb w-[min(500px,80vw)] h-[min(500px,80vw)] bg-primary-container/10 top-[-100px] left-[-100px]"></div>
              <div className="bg-orb w-[min(600px,90vw)] h-[min(600px,90vw)] bg-secondary-container/5 bottom-[-200px] right-[-100px]"></div>
            </div>

            <div className="relative z-10 space-y-8">
            <p className="font-data-sm text-data-sm text-on-surface-variant hidden sm:block">{formatPeriod(report.period_start, report.period_end)}</p>

            {alertMsg && (
              <AlertBanner type={alertMsg.type} message={alertMsg.text} onDismiss={() => setAlertMsg(null)} />
            )}

            {/* Mobile Header detail */}
            <div className="sm:hidden glass-panel p-5 rounded-xl border border-white/5 space-y-1">
              <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">{report.client.name}</h2>
              <p className="font-data-sm text-[13px] text-on-surface-variant">{formatPeriod(report.period_start, report.period_end)}</p>
              <div className="pt-2 flex items-center gap-2 text-xs">
                <span className="font-label-caps text-[10px] text-outline">STATUS:</span>
                <span className="text-secondary-container bg-secondary-container/10 px-2 py-0.5 rounded border border-secondary-container/20 font-bold uppercase">{report.status}</span>
              </div>
            </div>

            {/* Executive Summary Card */}
            <div className="glass-panel p-6 sm:p-8 rounded-xl border border-white/5 space-y-6 relative overflow-hidden group">
              <div className="absolute right-0 top-0 w-24 h-24 bg-primary-container/10 rounded-full blur-2xl pointer-events-none"></div>
              
              <div className="flex justify-between items-center border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>neurology</span>
                  <h3 className="font-headline-sm text-body-lg font-bold text-on-surface">Executive Commentary</h3>
                </div>
                {!editingSummary ? (
                  <button 
                    onClick={() => {
                      setEditingSummary(true);
                      setSummaryInput(report.ai_summary || '');
                    }}
                    className="flex items-center gap-1.5 text-xs text-primary hover:text-primary-fixed border border-primary/20 hover:border-primary/50 px-3 py-1.5 rounded-lg transition-colors font-label-caps text-label-caps"
                  >
                    <span className="material-symbols-outlined text-sm">edit</span>
                    Edit
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setEditingSummary(false)}
                      disabled={savingAction === 'summary'}
                      className="px-3 py-1.5 border border-white/10 hover:bg-white/5 text-xs rounded-lg transition-colors font-label-caps text-label-caps"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleSaveSummary}
                      disabled={savingAction === 'summary'}
                      className="px-3 py-1.5 bg-primary text-on-primary hover:shadow-lg text-xs rounded-lg transition-all font-label-caps text-label-caps flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-sm">{savingAction === 'summary' ? 'sync' : 'save'}</span>
                      {savingAction === 'summary' ? 'Saving...' : 'Save & Rebuild'}
                    </button>
                  </div>
                )}
              </div>

              {!editingSummary ? (
                <div className="font-body-md text-on-surface-variant leading-relaxed whitespace-pre-wrap">
                  {report.ai_summary || "No executive summary commentary written yet. Click 'Edit' to supply agency details."}
                </div>
              ) : (
                <textarea 
                  value={summaryInput} 
                  onChange={(e) => setSummaryInput(e.target.value)}
                  disabled={savingAction === 'summary'}
                  rows={6}
                  className={textareaClassName}
                  placeholder="Summarize the performance highlight metrics for this agency client..."
                />
              )}
            </div>

            {/* Platform Sections */}
            <div className="space-y-8">
              <h3 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[24px]">source</span>
                Channel Breakdown
              </h3>
              
              {report.sections.length === 0 ? (
                <div className="glass-panel p-12 text-center rounded-xl">
                  <p className="text-on-surface-variant">No platform breakdown sections available. Regenerate the report with platforms selected.</p>
                </div>
              ) : (
                report.sections.map((section) => {
                  const isEditing = editingSectionId === section.id;
                  const isSaving = savingAction === section.platform;
                  
                  return (
                    <div key={section.id} className="glass-card rounded-xl border border-white/5 overflow-hidden shadow-lg flex flex-col">
                      {/* Section Header */}
                      <div className="p-6 bg-white/2 flex justify-between items-center border-b border-white/5 flex-wrap gap-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg ${getPlatformGradient(section.platform)} flex items-center justify-center p-2 text-white shadow-md`}>
                            <span className="material-symbols-outlined text-[20px]">{getPlatformIcon(section.platform)}</span>
                          </div>
                          <div>
                            <h4 className="font-headline-sm text-body-lg font-bold text-on-surface">{getPlatformLabel(section.platform)}</h4>
                            <p className="font-label-caps text-[9px] text-outline mt-0.5">PERFORMANCE BREAKDOWN</p>
                          </div>
                        </div>
                        
                        {/* Editor Controls */}
                        {!isEditing ? (
                          <button 
                            onClick={() => {
                              setEditingSectionId(section.id);
                              setSectionCommentaryInput(section.ai_commentary || '');
                            }}
                            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary-fixed border border-primary/20 hover:border-primary/50 px-3 py-1.5 rounded-lg transition-colors font-label-caps text-label-caps"
                          >
                            <span className="material-symbols-outlined text-sm">edit</span>
                            Edit Commentary
                          </button>
                        ) : (
                          <div className="flex gap-2">
                            <button 
                              onClick={() => setEditingSectionId(null)}
                              disabled={isSaving}
                              className="px-3 py-1.5 border border-white/10 hover:bg-white/5 text-xs rounded-lg transition-colors font-label-caps text-label-caps"
                            >
                              Cancel
                            </button>
                            <button 
                              onClick={() => handleSaveSectionCommentary(section.platform)}
                              disabled={isSaving}
                              className="px-3 py-1.5 bg-primary text-on-primary hover:shadow-lg text-xs rounded-lg transition-all font-label-caps text-label-caps flex items-center gap-1"
                            >
                              <span className="material-symbols-outlined text-sm">{isSaving ? 'sync' : 'save'}</span>
                              {isSaving ? 'Saving...' : 'Save & Rebuild'}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Section Metrics Grid */}
                      <div className="p-6 border-b border-white/5">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                          
                          {/* GA4 Metric Card Mapping */}
                          {section.platform === 'ga4' && (
                            <>
                              <div className="bg-black/20 p-4 rounded-lg border border-white/5">
                                <p className="font-label-caps text-[10px] text-outline uppercase tracking-wider">Sessions</p>
                                <p className="font-data-lg text-data-lg text-white mt-1">{(section.metrics.sessions ?? 0).toLocaleString()}</p>
                              </div>
                              <div className="bg-black/20 p-4 rounded-lg border border-white/5">
                                <p className="font-label-caps text-[10px] text-outline uppercase tracking-wider">Pageviews</p>
                                <p className="font-data-lg text-data-lg text-white mt-1">{(section.metrics.pageviews ?? 0).toLocaleString()}</p>
                              </div>
                              <div className="bg-black/20 p-4 rounded-lg border border-white/5">
                                <p className="font-label-caps text-[10px] text-outline uppercase tracking-wider">Bounce Rate</p>
                                <p className="font-data-lg text-data-lg text-white mt-1">{section.metrics.bounce_rate ?? 0}%</p>
                              </div>
                              <div className="bg-black/20 p-4 rounded-lg border border-white/5">
                                <p className="font-label-caps text-[10px] text-outline uppercase tracking-wider">Avg Session Time</p>
                                <p className="font-data-lg text-data-lg text-white mt-1">
                                  {Math.floor((section.metrics.avg_session_duration ?? 0) / 60)}m {Math.round((section.metrics.avg_session_duration ?? 0) % 60)}s
                                </p>
                              </div>
                            </>
                          )}

                          {/* Google Ads Metric Cards */}
                          {section.platform === 'google_ads' && (
                            <>
                              <div className="bg-black/20 p-4 rounded-lg border border-white/5">
                                <p className="font-label-caps text-[10px] text-outline uppercase tracking-wider">Spend (INR)</p>
                                <p className="font-data-lg text-data-lg text-secondary-container mt-1">₹{(section.metrics.spend_inr ?? 0).toLocaleString()}</p>
                              </div>
                              <div className="bg-black/20 p-4 rounded-lg border border-white/5">
                                <p className="font-label-caps text-[10px] text-outline uppercase tracking-wider">Impressions</p>
                                <p className="font-data-lg text-data-lg text-white mt-1">{(section.metrics.impressions ?? 0).toLocaleString()}</p>
                              </div>
                              <div className="bg-black/20 p-4 rounded-lg border border-white/5">
                                <p className="font-label-caps text-[10px] text-outline uppercase tracking-wider">Clicks</p>
                                <p className="font-data-lg text-data-lg text-white mt-1">{(section.metrics.clicks ?? 0).toLocaleString()}</p>
                              </div>
                              <div className="bg-black/20 p-4 rounded-lg border border-white/5">
                                <p className="font-label-caps text-[10px] text-outline uppercase tracking-wider">CTR / Avg CPC</p>
                                <p className="font-data-lg text-data-lg text-primary mt-1">
                                  {section.metrics.ctr ?? 0}% / ₹{section.metrics.avg_cpc ?? 0}
                                </p>
                              </div>
                            </>
                          )}

                          {/* Meta Ads Metric Cards */}
                          {section.platform === 'meta_ads' && (
                            <>
                              <div className="bg-black/20 p-4 rounded-lg border border-white/5">
                                <p className="font-label-caps text-[10px] text-outline uppercase tracking-wider">Spend (INR)</p>
                                <p className="font-data-lg text-data-lg text-secondary-container mt-1">₹{(section.metrics.spend_inr ?? 0).toLocaleString()}</p>
                              </div>
                              <div className="bg-black/20 p-4 rounded-lg border border-white/5">
                                <p className="font-label-caps text-[10px] text-outline uppercase tracking-wider">Impressions / Reach</p>
                                <p className="font-data-lg text-data-lg text-white mt-1">
                                  {(section.metrics.impressions ?? 0).toLocaleString()} / {(section.metrics.reach ?? 0).toLocaleString()}
                                </p>
                              </div>
                              <div className="bg-black/20 p-4 rounded-lg border border-white/5">
                                <p className="font-label-caps text-[10px] text-outline uppercase tracking-wider">Link Clicks (CTR)</p>
                                <p className="font-data-lg text-data-lg text-white mt-1">
                                  {(section.metrics.clicks ?? 0).toLocaleString()} ({section.metrics.ctr ?? 0}%)
                                </p>
                              </div>
                              <div className="bg-black/20 p-4 rounded-lg border border-white/5">
                                <p className="font-label-caps text-[10px] text-outline uppercase tracking-wider">Purchase ROAS</p>
                                <p className="font-data-lg text-data-lg text-primary mt-1">{section.metrics.roas ?? 0}x</p>
                              </div>
                            </>
                          )}

                          {/* Search Console Metric Cards */}
                          {section.platform === 'search_console' && (
                            <>
                              <div className="bg-black/20 p-4 rounded-lg border border-white/5">
                                <p className="font-label-caps text-[10px] text-outline uppercase tracking-wider">Total Clicks</p>
                                <p className="font-data-lg text-data-lg text-white mt-1">{(section.metrics.total_clicks ?? 0).toLocaleString()}</p>
                              </div>
                              <div className="bg-black/20 p-4 rounded-lg border border-white/5">
                                <p className="font-label-caps text-[10px] text-outline uppercase tracking-wider">Impressions</p>
                                <p className="font-data-lg text-data-lg text-white mt-1">{(section.metrics.total_impressions ?? 0).toLocaleString()}</p>
                              </div>
                              <div className="bg-black/20 p-4 rounded-lg border border-white/5">
                                <p className="font-label-caps text-[10px] text-outline uppercase tracking-wider">Avg CTR</p>
                                <p className="font-data-lg text-data-lg text-primary mt-1">{section.metrics.avg_ctr ?? 0}%</p>
                              </div>
                              <div className="bg-black/20 p-4 rounded-lg border border-white/5">
                                <p className="font-label-caps text-[10px] text-outline uppercase tracking-wider">Avg Position</p>
                                <p className="font-data-lg text-data-lg text-white mt-1">{section.metrics.avg_position ?? 0}</p>
                              </div>
                            </>
                          )}
                          
                        </div>

                        {/* Top Pages/Campaigns/Queries Sub-tables */}
                        {section.platform === 'ga4' && section.metrics.top_pages?.length > 0 && (
                          <div className="mt-6 space-y-2.5">
                            <h5 className="font-label-caps text-[10px] text-outline uppercase tracking-wider">Top Pages Performance</h5>
                            <div className="overflow-x-auto">
                              <table className="w-full text-left font-data-sm text-xs">
                                <thead>
                                  <tr className="border-b border-white/5 text-on-surface-variant font-medium">
                                    <th className="pb-2">Page Path</th>
                                    <th className="pb-2 text-right">Pageviews</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {section.metrics.top_pages.map((p: any, idx: number) => (
                                    <tr key={idx} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                                      <td className="py-2 text-on-surface-variant truncate max-w-md">{p.page_path}</td>
                                      <td className="py-2 text-right text-white font-semibold">{(p.pageviews ?? 0).toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {section.platform === 'meta_ads' && section.metrics.top_campaigns?.length > 0 && (
                          <div className="mt-6 space-y-2.5">
                            <h5 className="font-label-caps text-[10px] text-outline uppercase tracking-wider">Top Campaign Performance</h5>
                            <div className="overflow-x-auto">
                              <table className="w-full text-left font-data-sm text-xs">
                                <thead>
                                  <tr className="border-b border-white/5 text-on-surface-variant font-medium">
                                    <th className="pb-2">Campaign Name</th>
                                    <th className="pb-2 text-right">Spend</th>
                                    <th className="pb-2 text-right">Clicks</th>
                                    <th className="pb-2 text-right">ROAS</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {section.metrics.top_campaigns.map((c: any, idx: number) => (
                                    <tr key={idx} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                                      <td className="py-2 text-on-surface truncate max-w-[200px] sm:max-w-[300px]">{c.campaign_name}</td>
                                      <td className="py-2 text-right text-secondary-container">₹{(c.spend ?? 0).toLocaleString()}</td>
                                      <td className="py-2 text-right text-white">{(c.clicks ?? 0).toLocaleString()}</td>
                                      <td className="py-2 text-right text-primary font-semibold">{c.roas ?? 0}x</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {section.platform === 'search_console' && section.metrics.top_queries?.length > 0 && (
                          <div className="mt-6 space-y-2.5">
                            <h5 className="font-label-caps text-[10px] text-outline uppercase tracking-wider">Top Search Queries</h5>
                            <div className="overflow-x-auto">
                              <table className="w-full text-left font-data-sm text-xs">
                                <thead>
                                  <tr className="border-b border-white/5 text-on-surface-variant font-medium">
                                    <th className="pb-2">Query</th>
                                    <th className="pb-2 text-right">Clicks</th>
                                    <th className="pb-2 text-right">Impressions</th>
                                    <th className="pb-2 text-right">Avg Position</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {section.metrics.top_queries.map((q: any, idx: number) => (
                                    <tr key={idx} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                                      <td className="py-2 text-on-surface truncate max-w-[150px] sm:max-w-[250px]">{q.query}</td>
                                      <td className="py-2 text-right text-white">{(q.clicks ?? 0).toLocaleString()}</td>
                                      <td className="py-2 text-right text-on-surface-variant">{(q.impressions ?? 0).toLocaleString()}</td>
                                      <td className="py-2 text-right text-primary font-semibold">{q.position}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Section AI Commentary / Text Box */}
                      <div className="p-6 bg-black/10 flex-1 flex flex-col justify-center">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="material-symbols-outlined text-primary text-[18px]">chat_bubble</span>
                          <h5 className="font-label-caps text-[10px] text-outline uppercase tracking-wider">AI Commentary & Insights</h5>
                        </div>
                        
                        {!isEditing ? (
                          <div className="font-body-md text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap">
                            {section.ai_commentary || "No AI commentary written yet. Click 'Edit Commentary' to add details."}
                          </div>
                        ) : (
                          <textarea 
                            value={sectionCommentaryInput} 
                            onChange={(e) => setSectionCommentaryInput(e.target.value)}
                            disabled={isSaving}
                            rows={4}
                            className={`${textareaClassName} text-sm`}
                            placeholder="Enter specific campaign context, observations, or goals for this marketing channel..."
                          />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            </div>
          </div>
    </AppShell>

      {isEmailModalOpen && (
        <div className="fixed inset-0 modal-overlay flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setIsEmailModalOpen(false)} aria-label="Close modal" />
          <form 
            onSubmit={handleSendEmail}
            className="glass-card modal-content w-full max-w-md relative rounded-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden"
          >
            <div className="h-1 w-full bg-gradient-to-r from-primary-container to-secondary-container"></div>
            <div className="p-8 space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center border border-white/10 shadow-inner">
                  <span className="material-symbols-outlined text-primary-container">mail</span>
                </div>
                <div>
                  <h2 className="font-headline-sm text-[22px] text-on-surface leading-tight">Send PDF Link</h2>
                  <p className="font-data-sm text-[13px] text-on-surface-variant mt-1">Dispatches report securely via Resend</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <FormField id="recipient-name" label="Recipient Name">
                  <input
                    id="recipient-name"
                    required
                    className={inputClassName}
                    placeholder="e.g. Parth Patel"
                    type="text"
                    value={emailForm.name}
                    onChange={(e) => setEmailForm({ ...emailForm, name: e.target.value })}
                    disabled={sendingEmail}
                  />
                </FormField>
                
                <FormField id="recipient-email" label="Recipient Email Address">
                  <input
                    id="recipient-email"
                    required
                    className={inputClassName}
                    placeholder="client@company.com"
                    type="email"
                    value={emailForm.email}
                    onChange={(e) => setEmailForm({ ...emailForm, email: e.target.value })}
                    disabled={sendingEmail}
                  />
                </FormField>

                <FormField id="custom-message" label="Custom Message (Optional)">
                  <textarea
                    id="custom-message"
                    rows={3}
                    className={textareaClassName}
                    placeholder="Here is the detailed summary performance report for your review..."
                    value={emailForm.message}
                    onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })}
                    disabled={sendingEmail}
                  />
                </FormField>
              </div>
              
              <div className="flex gap-4">
                <button 
                  disabled={sendingEmail}
                  type="button"
                  className="btn btn-ghost flex-1 py-3"
                  onClick={() => setIsEmailModalOpen(false)}
                >
                  Cancel
                </button>
                <button 
                  disabled={sendingEmail || !emailForm.email || !emailForm.name}
                  type="submit"
                  className="btn btn-secondary flex-1 py-3"
                >
                  {sendingEmail ? (
                    <>
                      <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                      Dispatching...
                    </>
                  ) : (
                    'Send Email'
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* 7. WhatsApp Share Modal */}
      {isWhatsappModalOpen && (
        <div className="fixed inset-0 modal-overlay flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setIsWhatsappModalOpen(false)} aria-label="Close modal" />
          <div className="glass-card modal-content w-full max-w-md relative rounded-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-whatsapp to-secondary-container"></div>
            <div className="p-8 space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center border border-white/10 shadow-inner">
                  <span className="material-symbols-outlined text-whatsapp">share</span>
                </div>
                <div>
                  <h2 className="font-headline-sm text-[22px] text-on-surface leading-tight">Share on WhatsApp</h2>
                  <p className="font-data-sm text-[13px] text-on-surface-variant mt-1">Copy and share pre-formatted template</p>
                </div>
              </div>

              {whatsappLoading ? (
                <div className="flex items-center justify-center py-8 font-label-caps text-xs text-outline gap-2">
                  <span className="material-symbols-outlined animate-spin">sync</span>
                  Creating Signed Link...
                </div>
              ) : (
                <div className="space-y-4">
                  <FormField id="whatsapp-template" label="Message Template">
                    <textarea
                      id="whatsapp-template"
                      readOnly
                      rows={4}
                      className={`${textareaClassName} text-sm select-all`}
                      value={whatsappTemplate}
                    />
                  </FormField>

                  <div className="flex gap-4">
                    <button 
                      className="flex-1 glass-panel text-on-surface font-label-caps text-label-caps py-3 rounded-lg hover:bg-white/10 transition-colors border border-white/20"
                      onClick={() => setIsWhatsappModalOpen(false)}
                    >
                      Close
                    </button>
                    <button 
                      type="button"
                      className="btn btn-whatsapp flex-1 py-3 font-bold"
                      onClick={() => {
                        // Copy to clipboard
                        navigator.clipboard.writeText(whatsappTemplate);
                        // Redirect to WhatsApp
                        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappTemplate)}`, '_blank');
                        setIsWhatsappModalOpen(false);
                        setAlertMsg({ type: 'success', text: 'Template copied and redirected to WhatsApp.' });
                      }}
                    >
                      <span className="material-symbols-outlined text-[16px]">content_copy</span>
                      <span>Copy & Open</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </>
  );
}
