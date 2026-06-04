'use client';

import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export type NavItem = 'dashboard' | 'integrations' | 'generate';

interface AppShellProps {
  children: React.ReactNode;
  activeNav?: NavItem;
  title?: string;
  headerActions?: React.ReactNode;
  showBack?: boolean;
  onBack?: () => void;
}

const NAV_ITEMS: { id: NavItem; href: string; label: string; icon: string }[] = [
  { id: 'dashboard', href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'integrations', href: '/integrations', label: 'Integrations', icon: 'hub' },
  { id: 'generate', href: '/reports/generate', label: 'Generate', icon: 'add_box' },
];

function NavLink({
  item,
  isActive,
  onNavigate,
  compact = false,
}: {
  item: (typeof NAV_ITEMS)[number];
  isActive: boolean;
  onNavigate: (href: string) => void;
  compact?: boolean;
}) {
  const base =
    'flex items-center gap-3 px-4 py-3 font-label-caps text-label-caps tracking-widest transition-all duration-200 rounded-lg w-full text-left';
  const active =
    'bg-primary-container/10 text-primary border-l-2 border-primary-container md:border-l-0 md:border-r-2';
  const inactive =
    'text-on-surface-variant hover:bg-white/5 hover:text-secondary md:hover:translate-x-0.5';

  return (
    <button
      type="button"
      onClick={() => onNavigate(item.href)}
      className={`${base} ${isActive ? active : inactive} ${compact ? 'flex-col gap-1 py-2 px-2 text-[10px]' : ''}`}
      aria-current={isActive ? 'page' : undefined}
    >
      <span
        className="material-symbols-outlined shrink-0"
        style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
      >
        {item.icon}
      </span>
      <span className={compact ? 'leading-tight' : ''}>{compact ? item.label.split(' ')[0] : item.label}</span>
    </button>
  );
}

export function AppShell({
  children,
  activeNav,
  title,
  headerActions,
  showBack,
  onBack,
}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const resolvedActive: NavItem | undefined =
    activeNav ??
    (pathname.startsWith('/integrations')
      ? 'integrations'
      : pathname.startsWith('/reports/generate')
        ? 'generate'
        : pathname.startsWith('/dashboard') || pathname.startsWith('/reports/')
          ? 'dashboard'
          : undefined);

  const handleNavigate = (href: string) => {
    setMobileMenuOpen(false);
    router.push(href);
  };

  const handleBack = () => {
    if (onBack) onBack();
    else router.push('/dashboard');
  };

  return (
    <div className="font-body-md bg-background text-on-background min-h-screen min-h-[100dvh] flex overflow-x-hidden selection:bg-primary-container selection:text-on-primary-container">
      {/* Desktop sidebar */}
      <nav
        className="hidden md:flex flex-col fixed left-0 top-0 h-full w-64 z-50 bg-surface-container-lowest/30 backdrop-blur-2xl border-r border-white/10 shadow-2xl py-8"
        aria-label="Main navigation"
      >
        <div className="px-6 mb-10 flex items-center gap-4 shrink-0">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-container to-primary flex items-center justify-center shadow-[0_0_15px_rgba(14,165,233,0.4)]">
            <span
              className="material-symbols-outlined text-on-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              analytics
            </span>
          </div>
          <div className="min-w-0">
            <h1 className="font-display-lg text-headline-sm font-bold text-primary tracking-tighter truncate">
              ReportAI
            </h1>
            <p className="font-label-caps text-label-caps text-outline truncate">AI Command Center</p>
          </div>
        </div>
        <div className="flex-1 flex flex-col gap-1 px-3 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.id}
              item={item}
              isActive={resolvedActive === item.id}
              onNavigate={handleNavigate}
            />
          ))}
        </div>
        <div className="px-6 mt-auto pt-4 shrink-0">
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem('supabase_session_token');
              router.push('/');
            }}
            className="w-full text-on-surface-variant hover:text-error transition-colors duration-300 font-label-caps text-label-caps flex items-center justify-center gap-2 py-2 rounded-lg hover:bg-error/5"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            Logout
          </button>
        </div>
      </nav>

      {/* Mobile slide-over menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          />
          <nav className="absolute left-0 top-0 bottom-0 w-[min(280px,85vw)] bg-surface-container-lowest border-r border-white/10 shadow-2xl flex flex-col py-6 px-4">
            <div className="flex items-center justify-between mb-8">
              <span className="font-headline-sm text-headline-sm font-bold text-primary">ReportAI</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/5 text-on-surface-variant"
                aria-label="Close menu"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="flex flex-col gap-1 flex-1">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.id}
                  item={item}
                  isActive={resolvedActive === item.id}
                  onNavigate={handleNavigate}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem('supabase_session_token');
                router.push('/');
              }}
              className="mt-4 text-error font-label-caps text-label-caps flex items-center gap-2 py-3 px-4 rounded-lg hover:bg-error/10"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
              Logout
            </button>
          </nav>
        </div>
      )}

      <main className="flex-1 md:ml-64 flex flex-col min-h-screen min-h-[100dvh] w-full min-w-0 pb-20 md:pb-0">
        <header className="sticky top-0 z-40 w-full flex justify-between items-center gap-4 px-margin-mobile md:px-margin-desktop min-h-16 md:min-h-20 py-3 bg-surface/40 backdrop-blur-xl border-b border-white/10 shadow-[0_0_20px_rgba(14,165,233,0.1)]">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden w-10 h-10 shrink-0 flex items-center justify-center rounded-lg hover:bg-white/5 text-on-surface"
              aria-label="Open navigation menu"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            {showBack && (
              <button
                type="button"
                onClick={handleBack}
                className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/5 text-on-surface-variant hover:text-primary transition-colors"
                aria-label="Go back"
              >
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
            )}
            <div className="min-w-0">
              <h2 className="font-headline-sm text-headline-sm md:text-headline-md font-extrabold text-on-surface tracking-tighter truncate">
                {title ?? 'ReportAI'}
              </h2>
            </div>
          </div>
          {headerActions && (
            <div className="flex items-center gap-2 sm:gap-3 shrink-0 flex-wrap justify-end">{headerActions}</div>
          )}
        </header>

        <div className="flex-1 p-margin-mobile md:p-margin-desktop overflow-y-auto overflow-x-hidden">
          <div className="page-container">{children}</div>
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface-container-lowest/95 backdrop-blur-xl border-t border-white/10 px-2 py-2 safe-area-pb"
        aria-label="Mobile tab navigation"
      >
        <div className="flex items-stretch justify-around gap-1 max-w-lg mx-auto">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.id}
              item={item}
              isActive={resolvedActive === item.id}
              onNavigate={handleNavigate}
              compact
            />
          ))}
        </div>
      </nav>
    </div>
  );
}
