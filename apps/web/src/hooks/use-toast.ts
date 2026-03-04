/**
 * Toast Manager Hook
 *
 * Provides toast.success/error/info/warning() helpers that push items into
 * a module-level store. Consumed by ToastProvider to render the toasts.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

// ============================================================================
// Types
// ============================================================================

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface IToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  durationMs: number;
}

// ============================================================================
// Module-level pub/sub (avoids React Context overhead for a simple manager)
// ============================================================================

type Listener = (toasts: IToastItem[]) => void;
const _listeners = new Set<Listener>();
let _toasts: IToastItem[] = [];
let _idCounter = 0;

const DURATIONS: Record<ToastVariant, number> = {
  success: 3000,
  error: 5000,
  info: 3000,
  warning: 4000,
};

function addToast(message: string, variant: ToastVariant): void {
  const id = String(++_idCounter);
  const item: IToastItem = { id, message, variant, durationMs: DURATIONS[variant] };
  _toasts = [..._toasts, item];
  _listeners.forEach((l) => {
    l(_toasts);
  });
}

function removeToast(id: string): void {
  _toasts = _toasts.filter((t) => t.id !== id);
  _listeners.forEach((l) => {
    l(_toasts);
  });
}

// ============================================================================
// Public toast API (callable outside React)
// ============================================================================

export const toast = {
  success: (message: string): void => {
    addToast(message, 'success');
  },
  error: (message: string): void => {
    addToast(message, 'error');
  },
  info: (message: string): void => {
    addToast(message, 'info');
  },
  warning: (message: string): void => {
    addToast(message, 'warning');
  },
};

// ============================================================================
// Hook (used by ToastProvider to read the live list)
// ============================================================================

export function useToastList(): { toasts: IToastItem[]; dismiss: (id: string) => void } {
  const [toasts, setToasts] = useState<IToastItem[]>(_toasts);

  useEffect(() => {
    const listener: Listener = (items) => {
      setToasts(items);
    };
    _listeners.add(listener);
    return () => {
      _listeners.delete(listener);
    };
  }, []);

  const dismiss = useCallback((id: string): void => {
    removeToast(id);
  }, []);

  return { toasts, dismiss };
}

// ============================================================================
// useToast — convenience hook that returns the toast action object
// ============================================================================

export function useToast(): { toast: typeof toast } {
  return { toast };
}
