/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
'use client';
/**
 * @noema/web — Copilot / RiskAlerts
 *
 * Surfaces riskFactors from agentHints (severity >= medium only).
 * critical/high: prominent cortex treatment.
 * medium: muted warning card.
 */
import * as React from 'react';
import type { IRiskFactor, RiskSeverity } from '@noema/contracts';
import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCopilotStore } from '@/stores/copilot-store';

// ── Constants ─────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<RiskSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const SEVERITY_ICON: Record<'critical' | 'high' | 'medium', LucideIcon> = {
  critical: ShieldAlert,
  high: AlertTriangle,
  medium: Info,
};

const SEVERITY_STYLE: Record<'critical' | 'high' | 'medium', string> = {
  critical: 'border-cortex-400/40 bg-cortex-400/5 text-cortex-400',
  high: 'border-cortex-400/20 bg-cortex-400/3 text-cortex-400',
  medium: 'border-border bg-muted/30 text-muted-foreground',
};

function probabilityLabel(p: number): string {
  if (p >= 0.7) return 'Likely';
  if (p >= 0.4) return 'Possible';
  return 'Unlikely';
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RiskAlerts(): React.JSX.Element {
  const hintsByPage = useCopilotStore((s) => s.hintsByPage);
  const activePageKey = useCopilotStore((s) => s.activePageKey);
  const hints = hintsByPage[activePageKey] ?? [];

  const allRisks: IRiskFactor[] = hints.flatMap((h) => h.riskFactors);
  const visibleRisks = allRisks
    .filter((r) => r.severity !== 'low')
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99));

  if (visibleRisks.length === 0) return <></>;

  return (
    <div className="flex flex-col border-b border-border">
      <div className="px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Risk Alerts
        </h3>
      </div>
      <div className="flex flex-col gap-2 px-4 pb-4">
        {visibleRisks.map((risk, i) => {
          const sev = risk.severity as 'critical' | 'high' | 'medium';
          const Icon = SEVERITY_ICON[sev];
          const style = SEVERITY_STYLE[sev];

          return (
            <div
              key={`${risk.type}-${String(i)}`}
              className={['rounded-lg border p-3', style].join(' ')}
            >
              <div className="flex items-start gap-2">
                <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold capitalize">
                      {risk.type.replace('-', ' ')}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {probabilityLabel(risk.probability)}
                    </span>
                  </div>
                  <p className="text-xs leading-snug">{risk.description}</p>
                  {risk.mitigation !== undefined && (
                    <p className="text-[10px] text-muted-foreground">
                      <span className="font-medium">Mitigation:</span> {risk.mitigation}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
