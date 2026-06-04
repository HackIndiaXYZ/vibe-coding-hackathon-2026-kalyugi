'use client';

import React from 'react';

interface AlertBannerProps {
  type: 'success' | 'error';
  message: string;
  onDismiss?: () => void;
}

export function AlertBanner({ type, message, onDismiss }: AlertBannerProps) {
  const styles =
    type === 'success'
      ? 'bg-secondary-container/10 border-secondary-container/30 text-secondary-container'
      : 'bg-error-container/20 border-error/50 text-error';

  return (
    <div
      className={`p-4 rounded-xl border flex justify-between items-start gap-3 ${styles}`}
      role="alert"
    >
      <span className="font-body-md text-sm leading-relaxed flex-1 min-w-0">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="material-symbols-outlined text-sm shrink-0 hover:opacity-70 transition-opacity"
          aria-label="Dismiss alert"
        >
          close
        </button>
      )}
    </div>
  );
}
