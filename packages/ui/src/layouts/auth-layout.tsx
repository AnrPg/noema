/**
 * @noema/ui - Auth Layout Component
 *
 * Centered layout for auth pages (login, register, etc.)
 */

import * as React from 'react';
import { cn } from '../lib/utils.js';

export interface AuthLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function AuthLayout({ children, className }: AuthLayoutProps) {
  return (
    <div
      className={cn(
        'min-h-screen flex items-center justify-center bg-background px-4 py-12',
        className
      )}
    >
      <div className="w-full max-w-md space-y-8">{children}</div>
    </div>
  );
}

export interface AuthHeaderProps {
  title: string;
  description?: string;
  logo?: React.ReactNode;
  className?: string;
}

export function AuthHeader({ title, description, logo, className }: AuthHeaderProps) {
  return (
    <div className={cn('text-center', className)}>
      {logo && <div className="flex justify-center mb-6">{logo}</div>}
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {description && <p className="text-muted-foreground mt-2">{description}</p>}
    </div>
  );
}
