'use client';
/**
 * @noema/web — Copilot / AlternativesWarnings
 *
 * Alternatives: approach + confidence + expandable pros/cons.
 * Warnings: severity-styled cards with optional "Fix" button.
 */
import * as React from 'react';
import type { IAlternative, IWarning, WarningSeverity } from '@noema/contracts';
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import { useCopilotStore } from '@/stores/copilot-store';

// ── Constants ─────────────────────────────────────────────────────────────────

const WARNING_STYLE: Record<WarningSeverity, string> = {
  critical: 'border-cortex-400/40 bg-cortex-400/5 text-cortex-400',
  high: 'border-myelin-400/30 bg-myelin-400/5 text-myelin-400',
  medium: 'border-amber-400/30 bg-amber-400/5 text-amber-500',
  low: 'border-border bg-muted/20 text-muted-foreground',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function AlternativesWarnings(): React.JSX.Element {
  const hintsByPage = useCopilotStore((s) => s.hintsByPage);
  const activePageKey = useCopilotStore((s) => s.activePageKey);
  const hints = hintsByPage[activePageKey] ?? [];

  const alternatives: IAlternative[] = hints.flatMap((h) => h.alternatives ?? []);
  const warnings: IWarning[] = hints.flatMap((h) => h.warnings ?? []);

  const [expandedAlts, setExpandedAlts] = React.useState<Set<number>>(new Set());

  const toggleAlt = (i: number): void => {
    setExpandedAlts((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  if (alternatives.length === 0 && warnings.length === 0) return <></>;

  return (
    <div className="flex flex-col">
      {alternatives.length > 0 && (
        <div className="border-b border-border">
          <div className="px-4 py-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Alternatives
            </h3>
          </div>
          <div className="flex flex-col gap-2 px-4 pb-4">
            {alternatives.map((alt, i) => {
              const expanded = expandedAlts.has(i);
              const ChevronIcon = expanded ? ChevronDown : ChevronRight;
              return (
                <div key={alt.approach} className="rounded-lg border border-border bg-muted/20">
                  <button
                    type="button"
                    onClick={() => {
                      toggleAlt(i);
                    }}
                    aria-expanded={expanded}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left focus:outline-none"
                  >
                    <p className="text-xs leading-snug text-foreground">{alt.approach}</p>
                    <ChevronIcon
                      className="ml-2 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </button>
                  {expanded && (
                    <div className="border-t border-border/50 px-3 py-2 text-xs">
                      <p className="mb-2 italic text-muted-foreground">{alt.reasoning}</p>
                      {alt.pros !== undefined && alt.pros.length > 0 && (
                        <div className="mb-1">
                          <span className="font-medium text-synapse-400">Pros:</span>
                          <ul className="mt-0.5 space-y-0.5">
                            {alt.pros.map((p: string) => (
                              <li key={p} className="text-foreground/80">
                                + {p}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {alt.cons !== undefined && alt.cons.length > 0 && (
                        <div>
                          <span className="font-medium text-cortex-400">Cons:</span>
                          <ul className="mt-0.5 space-y-0.5">
                            {alt.cons.map((c: string) => (
                              <li key={c} className="text-foreground/80">
                                − {c}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div>
          <div className="px-4 py-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Warnings
            </h3>
          </div>
          <div className="flex flex-col gap-2 px-4 pb-4">
            {warnings.map((w) => (
              <div
                key={`${w.type}:${w.message}`}
                className={['rounded-lg border p-3', WARNING_STYLE[w.severity]].join(' ')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase">{w.type}</span>
                    <p className="text-xs leading-snug">{w.message}</p>
                    {w.suggestedFix !== undefined && w.autoFixable !== true && (
                      <p className="text-[10px] text-muted-foreground">{w.suggestedFix}</p>
                    )}
                  </div>
                  {w.autoFixable === true && (
                    // Fix action: IWarning contract does not yet carry a fixAction payload.
                    // Button is rendered disabled until the API provides an actionable fix endpoint.
                    <button
                      type="button"
                      disabled
                      aria-label="Auto-fix this warning (not yet available)"
                      title={w.suggestedFix ?? 'Auto-fix coming soon'}
                      className="flex flex-shrink-0 cursor-not-allowed items-center gap-1 rounded-sm bg-background/60 px-2 py-1 text-[10px] font-semibold opacity-50 focus:outline-none"
                    >
                      <Wrench className="h-3 w-3" aria-hidden="true" />
                      Fix
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
