'use client';

import React from 'react';

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = 'Loading Command Center...' }: LoadingScreenProps) {
  return (
    <div
      className="flex h-screen w-full min-h-[100dvh] bg-surface-container-lowest text-on-surface items-center justify-center font-label-caps text-label-caps gap-3 px-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="material-symbols-outlined animate-spin text-primary text-2xl" aria-hidden="true">
        sync
      </span>
      <span>{message}</span>
    </div>
  );
}
