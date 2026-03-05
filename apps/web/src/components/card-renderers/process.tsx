'use client';

/**
 * @noema/web - Card Renderers
 * ProcessRenderer — multi-step process card with expandable steps.
 */

import * as React from 'react';
import type { IProcessContent } from '@noema/api-client';
import { cn } from '@noema/ui';
import { CardShell } from './card-shell.js';
import type { ICardRendererProps } from './types.js';

export default function ProcessRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode, isRevealed } = props;
  const content = card.content as unknown as IProcessContent;

  const [expandedSteps, setExpandedSteps] = React.useState<Set<number>>(() => new Set());

  React.useEffect(() => {
    setExpandedSteps(new Set());
  }, [card.id]);

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="line-clamp-1 font-medium">{content.processName}</span>
        <span className="text-muted-foreground ml-1 text-xs">
          · {String(content.steps.length)} steps
        </span>
      </CardShell>
    );
  }

  function toggleStep(index: number): void {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  const steps = [...content.steps].sort((a, b) => a.order - b.order);

  const actionSlot = (
    <div className="space-y-3">
      <p className="text-base font-semibold text-foreground">{content.processName}</p>
      <p className="text-xs text-muted-foreground">
        {String(steps.length)} steps — click a step to expand
      </p>
      <div className="space-y-1">
        {steps.map((step, i) => {
          const isExpanded = isRevealed || expandedSteps.has(i);
          return (
            <div key={i} className="rounded border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  toggleStep(i);
                }}
                aria-expanded={isExpanded}
                aria-label={`Step ${String(step.order)}: ${step.title}`}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 text-left text-sm',
                  'hover:bg-muted/50 transition-colors',
                  isExpanded && 'bg-muted/30'
                )}
              >
                <span className="w-6 h-6 rounded-full bg-synapse-400/20 text-synapse-600 text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {String(step.order)}
                </span>
                <span className="flex-1 font-medium text-foreground">{step.title}</span>
                <span className="text-muted-foreground text-xs">{isExpanded ? '▲' : '▼'}</span>
              </button>
              {isExpanded && (
                <div className="px-3 pb-3 pt-1 text-sm text-muted-foreground border-t border-border">
                  {step.description}
                  {step.imageUrl !== undefined && step.imageUrl !== '' && (
                    <img
                      src={step.imageUrl}
                      alt={`Step ${String(step.order)} illustration`}
                      className="mt-2 rounded max-h-40 object-contain"
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <CardShell
      {...props}
      {...(content.hint !== undefined ? { hint: content.hint } : {})}
      actions={actionSlot}
    >
      {content.explanation !== undefined && content.explanation !== '' && (
        <p className="text-sm text-muted-foreground">{content.explanation}</p>
      )}
    </CardShell>
  );
}
