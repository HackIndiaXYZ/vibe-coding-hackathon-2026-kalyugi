'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/app/components/AppShell';
import { LoadingScreen } from '@/app/components/LoadingScreen';

interface Client {
  id: string;
  name: string;
  industry?: string;
  logo_url?: string;
}

interface Report {
  id: string;
  client_id: string;
  client_name: string;
  period_start: string;
  period_end: string;
  status: 'draft' | 'generating' | 'ready' | 'sent' | 'failed';
  pdf_url?: string;
  metrics_snapshot?: any;
}

interface Profile {
  full_name?: string;
  agency_name?: string;
  email?: string;
  logo_url?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [nudgeCount, setNudgeCount] = useState(0);

  // 1. Fetch user data and active reports/clients on load
  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('supabase_session_token');
        if (!token) {
          router.push('/');
          return;
        }

        const headers = {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        };

        // Fetch User Profile
        const userRes = await fetch('/api/auth/user', { headers });
        if (userRes.status === 401) {
          localStorage.removeItem('supabase_session_token');
          router.push('/');
          return;
        }
        const userData = await userRes.json();
        if (userData.success) {
          setProfile(userData.data);
        }

        // Fetch Clients
        const clientsRes = await fetch('/api/clients', { headers });
        const clientsData = await clientsRes.json();
        let loadedClients: Client[] = [];
        if (clientsData.success) {
          loadedClients = clientsData.data;
          setClients(loadedClients);
        }

        // Fetch Reports
        const reportsRes = await fetch('/api/reports', { headers });
        const reportsData = await reportsRes.json();
        if (reportsData.success) {
          setReports(reportsData.data);
          
          // Calculate clients that haven't received reports this month
          const currentMonth = new Date().getMonth();
          const currentYear = new Date().getFullYear();
          const clientsWithReports = new Set(
            reportsData.data
              .filter((r: any) => {
                const reportDate = new Date(r.period_start);
                return reportDate.getMonth() === currentMonth && reportDate.getFullYear() === currentYear;
              })
              .map((r: any) => r.client_id)
          );
          
          const dueClients = loadedClients.filter(c => !clientsWithReports.has(c.id));
          setNudgeCount(dueClients.length);
        }
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  if (loading) {
    return <LoadingScreen />;
  }

  const firstName = profile?.full_name ? profile.full_name.split(' ')[0] : 'Agent';
  const agencyName = profile?.agency_name || 'ReportAI Agency';

  return (
    <AppShell activeNav="dashboard" title="Dashboard">
        <div className="flex flex-col gap-8 md:gap-12">
          {/* Profile strip */}
          <div className="glass-panel rounded-xl p-4 flex items-center gap-3 border border-white/5">
            <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center border border-white/10 shrink-0">
              <span className="material-symbols-outlined text-primary text-[20px]">person</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-data-sm text-data-sm text-on-surface truncate">{profile?.full_name || 'Admin User'}</p>
              <p className="font-label-caps text-[10px] text-on-surface-variant truncate">{agencyName}</p>
            </div>
          </div>
          
          {/* Action required banner */}
          {nudgeCount > 0 && (
            <div className="glass-panel-amber rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 stagger-1">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-error-container/20 flex items-center justify-center border border-error/30">
                  <span className="material-symbols-outlined text-error">warning</span>
                </div>
                <div>
                  <h3 className="font-headline-sm text-body-lg font-semibold text-error">Action Required</h3>
                  <p className="font-body-md text-on-surface-variant">{nudgeCount} clients haven't received reports this month.</p>
                </div>
              </div>
              <button 
                onClick={() => router.push('/reports/generate')}
                className="px-6 py-3 bg-error text-on-error font-label-caps text-label-caps rounded-lg hover:bg-error/90 transition-colors shadow-[0_0_15px_rgba(255,180,171,0.2)]"
              >
                Generate Report
              </button>
            </div>
          )}

          {/* Greeting Section */}
          <div className="w-full flex flex-col md:flex-row justify-between items-center gap-6 stagger-2">
            <div className="w-full md:w-auto text-left">
              <p className="font-label-caps text-[14px] text-outline mb-2">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
              <h2 className="font-display-lg-mobile md:font-display-lg text-display-lg-mobile md:text-display-lg text-on-surface">
                Good morning,<br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary-container text-glow">{firstName}</span>
              </h2>
            </div>
            
            <div className="relative flex items-center justify-center w-[120px] h-[120px] md:mr-12">
              <svg className="absolute inset-0 w-full h-full animate-[spin_12s_linear_infinite]" viewBox="0 0 100 100">
                <circle className="text-outline-variant/30" cx="50" cy="50" fill="none" r="48" stroke="currentColor" strokeDasharray="2 6" strokeWidth="1"></circle>
                <circle className="text-primary" cx="50" cy="50" fill="none" r="48" stroke="currentColor" strokeDasharray="60 250" strokeLinecap="round" strokeWidth="2"></circle>
                <circle className="text-secondary-container" cx="50" cy="50" fill="none" r="44" stroke="currentColor" strokeDasharray="30 270" strokeLinecap="round" strokeWidth="1.5" transform="rotate(120 50 50)"></circle>
              </svg>
              <div className="relative z-10 flex flex-col items-center justify-center text-center">
                <span className="font-display-lg text-[42px] font-bold text-primary text-glow leading-none mb-1">
                  {reports.filter(r => r.status === 'ready' || r.status === 'sent').length}
                </span>
                <span className="font-label-caps text-[8px] text-outline tracking-widest uppercase leading-tight">Reports</span>
                <span className="font-label-caps text-[8px] text-outline tracking-widest uppercase leading-tight">Compiled</span>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter stagger-2">
            {/* Card 1 */}
            <div className="stat-card">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-primary">group</span>
                <span className="font-label-caps text-[10px] text-outline uppercase tracking-widest">TOTAL CLIENTS</span>
              </div>
              <div className="mt-4">
                <span className="font-display-lg text-[48px] text-on-surface font-bold leading-none">{clients.length}</span>
              </div>
              <div className="flex items-end justify-between mt-auto">
                <span className="font-data-sm text-[12px] text-secondary-container bg-secondary-container/10 px-2 py-0.5 rounded border border-secondary-container/20 font-medium">Active</span>
                <svg fill="none" height="20" viewBox="0 0 60 20" width="60" xmlns="http://www.w3.org/2000/svg" className="text-secondary-container">
                  <path d="M0 15L15 10L30 18L45 5L60 2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                </svg>
              </div>
            </div>
            {/* Card 2 */}
            <div className="stat-card">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-secondary-container">assessment</span>
                <span className="font-label-caps text-[10px] text-outline uppercase tracking-widest">REPORTS TOTAL</span>
              </div>
              <div className="mt-4">
                <span className="font-display-lg text-[48px] text-on-surface font-bold leading-none">{reports.length}</span>
              </div>
              <div className="flex items-end justify-between mt-auto">
                <span className="font-data-sm text-[12px] text-secondary-container bg-secondary-container/10 px-2 py-0.5 rounded border border-secondary-container/20 font-medium">
                  {reports.filter(r => r.status === 'generating').length} running
                </span>
                <svg fill="none" height="20" viewBox="0 0 60 20" width="60" xmlns="http://www.w3.org/2000/svg" className="text-secondary-container">
                  <path d="M0 18L15 12L30 15L45 8L60 3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                </svg>
              </div>
            </div>
            {/* Card 3 */}
            <div className="stat-card">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-primary">schedule</span>
                <span className="font-label-caps text-[10px] text-outline uppercase tracking-widest">HOURS SAVED</span>
              </div>
              <div className="mt-4 flex items-baseline">
                <span className="font-display-lg text-[48px] text-on-surface font-bold leading-none">{reports.length * 4}</span>
                <span className="text-xl text-outline ml-1 font-display-lg">h</span>
              </div>
              <div className="flex items-end justify-between mt-auto">
                <span className="font-data-sm text-[12px] text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20 font-medium">~4h per report</span>
                <svg fill="none" height="20" viewBox="0 0 60 20" width="60" xmlns="http://www.w3.org/2000/svg" className="text-primary-container">
                  <path d="M0 12L15 8L30 14L45 6L60 2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                </svg>
              </div>
            </div>
            {/* Card 4 */}
            <div className="stat-card">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-error">trending_up</span>
                <span className="font-label-caps text-[10px] text-outline uppercase tracking-widest">SENT REPORTS</span>
              </div>
              <div className="mt-4 flex items-baseline">
                <span className="font-display-lg text-[48px] text-on-surface font-bold leading-none">
                  {reports.filter(r => r.status === 'sent').length}
                </span>
              </div>
              <div className="flex items-end justify-between mt-auto">
                <span className="font-data-sm text-[12px] text-error bg-error/10 px-2 py-0.5 rounded border border-error/20 font-medium">Delivered</span>
                <svg fill="none" height="20" viewBox="0 0 60 20" width="60" xmlns="http://www.w3.org/2000/svg" className="text-error">
                  <path d="M0 5L15 8L30 4L45 12L60 18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                </svg>
              </div>
            </div>
          </div>

          {/* Active Campaigns grid */}
          <div className="flex flex-col gap-6 stagger-3 mt-12">
            <div className="flex items-center justify-between">
              <h3 className="font-headline-sm text-headline-sm text-on-surface">Recent Campaigns & Reports</h3>
            </div>
            
            {reports.length === 0 ? (
              <div className="glass-panel p-12 text-center rounded-xl flex flex-col items-center gap-4 border border-white/10">
                <span className="material-symbols-outlined text-primary text-5xl">folder_open</span>
                <p className="font-body-lg text-on-surface-variant">No reports generated yet. Get started by launching the wizard.</p>
                <button
                  onClick={() => router.push('/reports/generate')}
                  className="bg-primary text-on-primary font-label-caps text-label-caps px-6 py-3 rounded-lg hover:shadow-lg transition-all"
                >
                  Create Your First Report
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
                {reports.map((report) => {
                  const hasMeta = report.metrics_snapshot?.meta_ads !== undefined;
                  const hasGoogle = report.metrics_snapshot?.google_ads !== undefined;
                  const hasGA4 = report.metrics_snapshot?.ga4 !== undefined;
                  const hasConsole = report.metrics_snapshot?.search_console !== undefined;

                  const periodStart = new Date(report.period_start);
                  const formattedPeriod = periodStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

                  // Dynamic Badge color
                  let badgeClass = 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30';
                  if (report.status === 'ready') badgeClass = 'text-primary bg-primary/10 border-primary/30';
                  if (report.status === 'sent') badgeClass = 'text-secondary-container bg-secondary-container/10 border-secondary-container/30';
                  if (report.status === 'failed') badgeClass = 'text-error bg-error/10 border-error/30';

                  return (
                    <div key={report.id} className="glass-panel rounded-xl p-6 flex flex-col gap-6 transform hover:scale-[1.02] transition-transform duration-200">
                      <div className="flex justify-between items-start">
                        <div className="w-12 h-12 rounded-full bg-surface-container border border-outline-variant flex items-center justify-center overflow-hidden">
                          <span className="material-symbols-outlined text-primary text-2xl">campaign</span>
                        </div>
                        <span className={`font-label-caps text-label-caps px-3 py-1 rounded-full border shadow-sm ${badgeClass}`}>
                          {report.status.toUpperCase()}
                        </span>
                      </div>
                      
                      <div>
                        <h4 className="font-headline-sm text-[20px] text-on-surface font-semibold mb-1 truncate">
                          {report.client_name}
                        </h4>
                        <p className="font-label-caps text-xs text-outline mb-2">{formattedPeriod}</p>
                        <div className="font-body-md text-xs text-outline-variant flex flex-wrap gap-2 items-center">
                          {hasMeta && <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded">Meta</span>}
                          {hasGoogle && <span className="px-2 py-0.5 bg-red-500/10 text-red-400 rounded">Google Ads</span>}
                          {hasGA4 && <span className="px-2 py-0.5 bg-orange-500/10 text-orange-400 rounded">GA4</span>}
                          {hasConsole && <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 rounded">SEO</span>}
                          {!hasMeta && !hasGoogle && !hasGA4 && !hasConsole && <span className="text-outline">No sources</span>}
                        </div>
                      </div>

                      <button 
                        type="button"
                        onClick={() => router.push(`/reports/${report.id}`)}
                        className="btn btn-ghost w-full py-3 mt-auto border-primary/50 text-primary hover:bg-primary/10 hover:shadow-[0_0_15px_rgba(14,165,233,0.3)]"
                      >
                        {report.status === 'ready' || report.status === 'sent' ? 'View Report' : 'Manage / Re-generate'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
    </AppShell>
  );
}
