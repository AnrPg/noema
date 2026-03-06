/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */

/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/**
 * Copilot Suggestions Preview
 *
 * Top 3 agent-recommended actions from useCopilotStore().
 * Actions are drawn from hintsByPage, flattened, deduplicated, sorted by priority.
 */

'use client';

import type { ActionCategory, ActionPriority } from '@noema/contracts';
import { Card, CardContent, CardHeader, CardTitle } from '@noema/ui';
import { AlertTriangle, BookOpen, Compass, ExternalLink, SlidersHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCopilotStore } from '@/stores/copilot-store';

// ============================================================================
// Constants
// ============================================================================

const CATEGORY_ICON: Record<ActionCategory, LucideIcon> = {
  exploration: Compass,
  optimization: SlidersHorizontal,
  correction: AlertTriangle,
  learning: BookOpen,
};

const PRIORITY_COLOR: Record<ActionPriority, string> = {
  critical: 'text-cortex-400 border-cortex-400/30 bg-cortex-400/5',
  high: 'text-myelin-400 border-myelin-400/30 bg-myelin-400/5',
  medium: 'text-synapse-400 border-synapse-400/30 bg-synapse-400/5',
  low: 'text-axon-400 border-axon-400/30 bg-axon-400/5',
};

const PRIORITY_ORDER: Record<ActionPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ============================================================================
// Component
// ============================================================================

export function CopilotSuggestions(): React.JSX.Element {
  const hintsByPage = useCopilotStore((s) => s.hintsByPage);
  const open = useCopilotStore((s) => s.open);

  // Flatten all actions across all pages, deduplicate, sort by priority, take top 3
  const allActions = Object.values(hintsByPage).flatMap((hints) =>
    hints.flatMap((h) => h.suggestedNextActions)
  );
  const seen = new Set<string>();
  const deduplicated = allActions.filter((a) => {
    if (seen.has(a.action)) return false;
    seen.add(a.action);
    return true;
  });
  const top3 = deduplicated
    .sort(
      (a, b) =>
        (PRIORITY_ORDER[a.priority as ActionPriority] ?? 99) -
        (PRIORITY_ORDER[b.priority as ActionPriority] ?? 99)
    )
    .slice(0, 3);

  if (top3.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Copilot Suggestions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Interact with Noema to get personalized suggestions
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm">Copilot Suggestions</CardTitle>
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => {
            open();
          }}
        >
          See all
          <ExternalLink className="h-3 w-3" />
        </button>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          {top3.map((action) => {
            const category: ActionCategory = action.category ?? 'learning';
            const Icon = (CATEGORY_ICON[category] ?? BookOpen) as React.FC<
              React.SVGProps<SVGSVGElement>
            >;
            const colorClass = PRIORITY_COLOR[action.priority];

            return (
              <div
                key={action.action}
                className={`rounded-lg border p-3 ${colorClass} flex flex-col gap-2`}
              >
                <div className="flex items-start gap-2">
                  <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <p className="text-xs font-medium leading-tight line-clamp-2">
                    {action.description ?? action.action}
                  </p>
                </div>
                {action.estimatedTime !== undefined && (
                  <p className="text-[10px] text-muted-foreground">
                    ~{String(Math.ceil(action.estimatedTime / 60_000))}m
                  </p>
                )}
                <button
                  type="button"
                  className="mt-auto rounded-sm bg-background/60 px-2 py-1 text-[10px] font-semibold hover:bg-background/80 transition-colors"
                  onClick={() => {
                    // Phase 10: trigger action
                  }}
                >
                  Do it
                </button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
