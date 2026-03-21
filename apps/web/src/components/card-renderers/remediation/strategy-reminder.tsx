'use client';

/**
 * @noema/web - Card Renderers
 * StrategyReminderRenderer — reinforces when and how to apply a specific learning strategy.
 */

import * as React from 'react';
import type { IStrategyReminderContent } from '@noema/api-client';
import { CardShell } from '../card-shell';
import type { ICardRendererProps } from '../types';

export default function StrategyReminderRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode } = props;
  const content = card.content as unknown as IStrategyReminderContent;

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="font-medium line-clamp-1">{content.strategy}</span>
        <span className="text-muted-foreground text-xs ml-1">· strategy reminder</span>
      </CardShell>
    );
  }

  const actionSlot = (
    <div className="space-y-4">
      {/* Strategy name */}
      <div className="rounded border border-synapse-400/30 bg-muted/30 p-3 space-y-1">
        <p className="text-xs font-semibold text-synapse-400 uppercase tracking-wide">Strategy</p>
        <p className="text-base font-medium text-foreground">{content.strategy}</p>
      </div>

      {!props.isRevealed && (
        <p className="text-sm text-muted-foreground italic">
          Recall: when to use this strategy, when not to, and an example. Reveal to verify.
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
        {/* When to use */}
        <div className="rounded border border-green-500/30 bg-green-50/5 p-3 space-y-1">
          <p className="text-xs font-semibold text-green-400 uppercase tracking-wide">
            When to Use
          </p>
          <p className="text-sm text-foreground">{content.whenToUse}</p>
        </div>

        {/* When NOT to use */}
        <div className="rounded border border-red-500/30 bg-red-50/5 p-3 space-y-1">
          <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">
            When NOT to Use
          </p>
          <p className="text-sm text-foreground">{content.whenNotToUse}</p>
        </div>

        {/* Example application */}
        <div className="rounded border border-border bg-muted/20 p-3 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Example Application
          </p>
          <p className="text-sm text-foreground">{content.exampleApplication}</p>
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
