/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

'use client';
/**
 * @noema/web — Copilot / SuggestedActions
 *
 * Groups and renders ISuggestedAction items from agentHints.
 * Sorted: critical > high > medium > low.
 * Grouped by category (Exploration / Optimization / Correction / Learning).
 * "Do it" button navigates to mapped route.
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { ISuggestedAction, ActionCategory, ActionPriority } from '@noema/contracts';
import { ConfidenceMeter } from '@noema/ui';
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Compass,
  SlidersHorizontal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCopilotStore } from '@/stores/copilot-store';

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<ActionPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const PRIORITY_BORDER: Record<ActionPriority, string> = {
  critical: 'border-l-cortex-400',
  high: 'border-l-myelin-400',
  medium: 'border-l-synapse-400',
  low: 'border-l-axon-400',
};

const PRIORITY_TEXT: Record<ActionPriority, string> = {
  critical: 'text-cortex-400',
  high: 'text-myelin-400',
  medium: 'text-synapse-400',
  low: 'text-axon-400',
};

const CATEGORY_ICON: Record<ActionCategory, LucideIcon> = {
  exploration: Compass,
  optimization: SlidersHorizontal,
  correction: AlertTriangle,
  learning: BookOpen,
};

const CATEGORY_LABEL: Record<ActionCategory, string> = {
  exploration: 'Exploration',
  optimization: 'Optimization',
  correction: 'Correction',
  learning: 'Learning',
};

const CATEGORY_ORDER: ActionCategory[] = ['correction', 'exploration', 'optimization', 'learning'];

/**
 * Maps action identifiers to Next.js routes.
 * Unknown actions: button shown but no navigation.
 */
const ACTION_ROUTES: Record<string, string> = {
  'review-cards': '/reviews',
  'start-review': '/session/new',
  'view-knowledge-map': '/knowledge',
  'view-health-dashboard': '/knowledge/health',
  'view-misconceptions': '/knowledge/misconceptions',
  'view-comparison': '/knowledge/comparison',
  'browse-card-library': '/cards',
  'go-to-goals': '/goals',
  'start-session': '/session/new',
  'view-dashboard': '/dashboard',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function SuggestedActions(): React.JSX.Element {
  const router = useRouter();
  const hintsByPage = useCopilotStore((s) => s.hintsByPage);
  const activePageKey = useCopilotStore((s) => s.activePageKey);
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<ActionCategory>>(new Set());

  const hints = hintsByPage[activePageKey] ?? [];

  // Flatten → deduplicate → sort
  const allActions = hints.flatMap((h) => h.suggestedNextActions);
  const seen = new Set<string>();
  const uniqueActions = allActions.filter((a) => {
    if (seen.has(a.action)) return false;
    seen.add(a.action);
    return true;
  });
  uniqueActions.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  // Group by category
  const grouped = new Map<ActionCategory, ISuggestedAction[]>();
  for (const action of uniqueActions) {
    const cat: ActionCategory = action.category ?? 'learning';
    const list = grouped.get(cat) ?? [];
    list.push(action);
    grouped.set(cat, list);
  }

  const toggleGroup = (cat: ActionCategory): void => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const handleDoIt = (action: ISuggestedAction): void => {
    const route = ACTION_ROUTES[action.action];
    if (route !== undefined) {
      router.push(route as never);
    }
  };

  if (uniqueActions.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-xs text-muted-foreground">
        No suggested actions for this page.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((cat) => {
        const actions = grouped.get(cat) ?? [];
        const Icon = CATEGORY_ICON[cat];
        const isCollapsed = collapsedGroups.has(cat);
        const ChevronIcon = isCollapsed ? ChevronRight : ChevronDown;

        return (
          <div key={cat} className="border-b border-border last:border-0">
            {/* Group header */}
            <button
              type="button"
              onClick={() => {
                toggleGroup(cat);
              }}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-muted/50 focus:outline-none"
              aria-expanded={!isCollapsed}
            >
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {CATEGORY_LABEL[cat]}
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                  {String(actions.length)}
                </span>
              </span>
              <ChevronIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            </button>

            {/* Actions in group */}
            {!isCollapsed && (
              <div className="flex flex-col gap-0">
                {actions.map((action) => {
                  const estimatedMin =
                    action.estimatedTime !== undefined
                      ? Math.ceil(action.estimatedTime / 60_000)
                      : null;

                  return (
                    <div
                      key={action.action}
                      className={[
                        'flex flex-col gap-2 border-l-2 px-4 py-3',
                        'bg-card transition-colors hover:bg-muted/30',
                        PRIORITY_BORDER[action.priority],
                      ].join(' ')}
                    >
                      {/* Priority label */}
                      <span
                        className={[
                          'text-[10px] font-semibold uppercase',
                          PRIORITY_TEXT[action.priority],
                        ].join(' ')}
                      >
                        {action.priority}
                      </span>

                      {/* Description */}
                      <p className="text-xs leading-snug text-foreground">
                        {action.description ?? action.action}
                      </p>

                      {/* Meta row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {estimatedMin !== null && (
                            <span className="text-[10px] text-muted-foreground">
                              ~{String(estimatedMin)}m
                            </span>
                          )}
                          {action.confidence !== undefined && (
                            <ConfidenceMeter value={action.confidence} segments={3} size="xs" />
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            handleDoIt(action);
                          }}
                          className="rounded-sm bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          Do it
                        </button>
                      </div>

                      {/* Prerequisites */}
                      {action.prerequisites !== undefined && action.prerequisites.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {action.prerequisites.map((prereq) => (
                            <span
                              key={prereq}
                              className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                            >
                              requires: {prereq}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
