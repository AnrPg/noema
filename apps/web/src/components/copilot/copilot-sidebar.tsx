/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/restrict-plus-operands */
'use client';
/**
 * @noema/web — Copilot / CopilotSidebar
 *
 * Persistent, toggleable right-aligned panel. Surfaces agentHints from all
 * API calls on the current page. Does not push main content — overlays it.
 * Keyboard shortcut: Cmd+. / Ctrl+.
 */
import * as React from 'react';
import type { IAgentHints, SourceQuality } from '@noema/contracts';
import { NeuralGauge } from '@noema/ui';
import { X } from 'lucide-react';
import { useCopilotStore } from '@/stores/copilot-store';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SOURCE_QUALITY_ORDER: Record<SourceQuality, number> = {
  high: 0,
  medium: 1,
  low: 2,
  unknown: 3,
};

function bestSourceQuality(hints: IAgentHints[]): SourceQuality {
  if (hints.length === 0) return 'unknown';
  return hints.reduce<SourceQuality>((best, h) => {
    return (SOURCE_QUALITY_ORDER[h.sourceQuality] ?? 99) < (SOURCE_QUALITY_ORDER[best] ?? 99)
      ? h.sourceQuality
      : best;
  }, 'unknown');
}

function avgConfidence(hints: IAgentHints[]): number {
  if (hints.length === 0) return 0;
  return hints.reduce((sum, h) => sum + h.confidence, 0) / hints.length;
}

const SOURCE_QUALITY_STYLE: Record<SourceQuality, string> = {
  high: 'bg-synapse-400/15 text-synapse-400',
  medium: 'bg-myelin-400/15 text-myelin-400',
  low: 'bg-cortex-400/15 text-cortex-400',
  unknown: 'bg-muted text-muted-foreground',
};

const SOURCE_QUALITY_LABEL: Record<SourceQuality, string> = {
  high: 'High Quality',
  medium: 'Medium Quality',
  low: 'Low Quality',
  unknown: 'Unknown Quality',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function CopilotSidebar(): React.JSX.Element {
  const isOpen = useCopilotStore((s) => s.isOpen);
  const close = useCopilotStore((s) => s.close);
  const toggle = useCopilotStore((s) => s.toggle);
  const hintsByPage = useCopilotStore((s) => s.hintsByPage);
  const activePageKey = useCopilotStore((s) => s.activePageKey);
  const expiringPages = useCopilotStore((s) => s.expiringPages);
  const lastReceivedAt = useCopilotStore((s) => s.lastReceivedAt);

  const hints: IAgentHints[] = hintsByPage[activePageKey] ?? [];
  const isExpiring = expiringPages.has(activePageKey);
  const confidence = avgConfidence(hints);
  const sourceQuality = bestSourceQuality(hints);

  // "Last updated X ago" — updates every 10s
  const [lastUpdatedLabel, setLastUpdatedLabel] = React.useState<string>('');
  React.useEffect(() => {
    const receivedAt = lastReceivedAt[activePageKey];
    if (receivedAt === undefined) {
      setLastUpdatedLabel('');
      return;
    }
    const update = (): void => {
      const diffSec = Math.floor((Date.now() - receivedAt) / 1000);
      if (diffSec < 60) setLastUpdatedLabel(`${String(diffSec)}s ago`);
      else if (diffSec < 3600) setLastUpdatedLabel(`${String(Math.floor(diffSec / 60))}m ago`);
      else setLastUpdatedLabel(`${String(Math.floor(diffSec / 3600))}h ago`);
    };
    update();
    const id = setInterval(update, 10_000);
    return () => {
      clearInterval(id);
    };
  }, [activePageKey, lastReceivedAt]);

  // Cmd+. / Ctrl+. keyboard shortcut
  React.useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === '.' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [toggle]);

  const hasHints = hints.length > 0;

  return (
    <>
      {/* Backdrop — click to close */}
      {isOpen && <div className="fixed inset-0 z-30" onClick={close} aria-hidden="true" />}

      {/* Sidebar panel */}
      <aside
        role="complementary"
        aria-label="Cognitive Copilot"
        className={[
          'fixed right-0 top-0 z-40 flex h-full w-[360px] flex-col',
          'border-l border-border bg-card shadow-2xl',
          'transition-[transform,opacity] duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
          isExpiring ? 'opacity-30' : 'opacity-100',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <NeuralGauge value={confidence} size="sm" />
            <div>
              <p className="text-sm font-semibold text-foreground">Cognitive Copilot</p>
              <span
                className={[
                  'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                  SOURCE_QUALITY_STYLE[sourceQuality],
                ].join(' ')}
              >
                {SOURCE_QUALITY_LABEL[sourceQuality]}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close Cognitive Copilot"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex flex-1 flex-col overflow-y-auto">
          {!hasHints ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
              <p className="text-sm font-medium text-foreground">No suggestions yet</p>
              <p className="text-xs text-muted-foreground">
                Navigate or study to generate new suggestions
              </p>
            </div>
          ) : (
            <>
              {/* Placeholder sections — replaced by T10.C–T10.F */}
              <div className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
                Suggested Actions section (T10.C)
              </div>
              <div className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
                Risk Alerts section (T10.D)
              </div>
              <div className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
                Transparency section (T10.E)
              </div>
              <div className="px-4 py-3 text-xs text-muted-foreground">
                Alternatives &amp; Warnings section (T10.F)
              </div>
            </>
          )}
        </div>

        {/* Footer — last updated */}
        {lastUpdatedLabel !== '' && (
          <div className="border-t border-border px-4 py-2">
            <p className="text-[10px] text-muted-foreground">Last updated {lastUpdatedLabel}</p>
          </div>
        )}
      </aside>
    </>
  );
}
