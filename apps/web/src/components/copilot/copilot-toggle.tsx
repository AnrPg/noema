'use client';
/**
 * @noema/web — Copilot / CopilotToggle
 *
 * Floating circular button — bottom-right corner (z-50).
 * Shows PulseIndicator when unread high-priority actions exist.
 * Hidden during active sessions (/session/* routes).
 * Shows badge count for unread critical/high actions.
 */
import * as React from 'react';
import { usePathname } from 'next/navigation';
import { PulseIndicator } from '@noema/ui';
import { Brain, X } from 'lucide-react';
import { useCopilotStore } from '@/stores/copilot-store';

export function CopilotToggle(): React.JSX.Element | null {
  const isOpen = useCopilotStore((s) => s.isOpen);
  const toggle = useCopilotStore((s) => s.toggle);
  const unreadHighCount = useCopilotStore((s) => s.unreadHighCount);
  const pathname = usePathname();

  // Hide during active sessions
  if (pathname.startsWith('/session/')) return null;

  const hasUnread = unreadHighCount > 0;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Unread badge */}
      {hasUnread && !isOpen && (
        <span className="absolute -right-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-cortex-400 text-[10px] font-bold text-white">
          {unreadHighCount > 9 ? '9+' : String(unreadHighCount)}
        </span>
      )}

      {/* PulseIndicator ring when unread and closed */}
      {hasUnread && !isOpen && (
        <span className="absolute inset-0 z-0 flex items-center justify-center">
          <PulseIndicator active size="sm" />
        </span>
      )}

      <button
        type="button"
        onClick={toggle}
        aria-label={isOpen ? 'Close Cognitive Copilot' : 'Open Cognitive Copilot'}
        aria-expanded={isOpen}
        className={[
          'relative z-10 flex h-12 w-12 items-center justify-center rounded-full shadow-lg',
          'transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          isOpen
            ? 'bg-muted text-foreground hover:bg-muted/80'
            : 'bg-synapse-400 text-white hover:bg-synapse-500',
        ].join(' ')}
      >
        {isOpen ? <X className="h-5 w-5" /> : <Brain className="h-5 w-5" />}
      </button>
    </div>
  );
}
