'use client';

/**
 * @noema/web - Card Renderers
 * SelfCheckRitualRenderer — structured self-check steps to apply when a trigger concept appears.
 */

import * as React from 'react';
import type { ISelfCheckRitualContent } from '@noema/api-client';
import { CardShell } from '../card-shell';
import type { ICardRendererProps } from '../types';

export default function SelfCheckRitualRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode } = props;
  const content = card.content as unknown as ISelfCheckRitualContent;

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="font-medium line-clamp-1">{content.concept}</span>
        <span className="text-muted-foreground text-xs ml-1">
          · self-check ({String(content.checkSteps.length)} step
          {content.checkSteps.length !== 1 ? 's' : ''})
        </span>
      </CardShell>
    );
  }

  const actionSlot = (
    <div className="space-y-4">
      {/* Concept */}
      <div className="rounded border border-border bg-muted/30 p-3 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Concept
        </p>
        <p className="text-base font-medium text-foreground">{content.concept}</p>
      </div>

      {/* Trigger */}
      <div className="rounded border border-amber-500/30 bg-amber-50/5 p-3 space-y-1">
        <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
          When to Apply
        </p>
        <p className="text-sm text-foreground">{content.trigger}</p>
      </div>

      {!props.isRevealed && (
        <p className="text-sm text-muted-foreground italic">
          Recall the self-check steps for this concept. Reveal to verify.
        </p>
      )}
    </div>
  );

  return (
    <CardShell
      {...props}
      {...(content.hint !== undefined ? { hint: content.hint } : {})}
      actions={actionSlot}
    >
      <div className="space-y-3">
        {/* Check steps */}
        <div className="rounded border border-border bg-muted/20 p-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Self-Check Steps
          </p>
          <ol className="space-y-2">
            {content.checkSteps.map((item) => (
              <li key={item.step} className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-synapse-400/20 text-synapse-400 text-xs font-bold flex items-center justify-center">
                  {String(item.step)}
                </span>
                <p className="text-sm text-foreground pt-0.5">{item.question}</p>
              </li>
            ))}
          </ol>
        </div>

        {content.explanation !== undefined && content.explanation !== '' && (
          <p className="text-sm text-muted-foreground border-t border-border pt-3">
            {content.explanation}
          </p>
        )}
      </div>
    </CardShell>
  );
}
