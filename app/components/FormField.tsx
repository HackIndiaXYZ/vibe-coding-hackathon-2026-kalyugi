'use client';

import React from 'react';

interface FormFieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({ id, label, error, hint, children, className = '' }: FormFieldProps) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={id} className="form-label">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="form-error" role="alert">
          {error}
        </p>
      )}
      {hint && !error && <p className="form-hint">{hint}</p>}
    </div>
  );
}

export const inputClassName =
  'form-input w-full';

export const selectClassName =
  'form-input w-full appearance-none cursor-pointer';

export const textareaClassName =
  'form-input w-full min-h-[6rem] resize-y';
