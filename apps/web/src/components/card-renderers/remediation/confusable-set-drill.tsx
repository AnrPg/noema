'use client';

/**
 * @noema/web - Card Renderers
 * ConfusableSetDrillRenderer — drills a set of commonly confused terms with distinguishing features.
 */

import * as React from 'react';
import type { IConfusableSetDrillContent } from '@noema/api-client';
import { CardShell } from '../card-shell';
import type { ICardRendererProps } from '../types';

export default function ConfusableSetDrillRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode } = props;
  const content = card.content as unknown as IConfusableSetDrillContent;

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="font-medium line-clamp-1">
          {content.items.map((i) => i.term).join(' · ')}
        </span>
        <span className="text-muted-foreground text-xs ml-1">
          · confusable set ({String(content.items.length)})
        </span>
      </CardShell>
    );
  }

  const actionSlot = (
    <div className="space-y-4">
      {/* Confusion pattern */}
      <div className="rounded border border-amber-500/30 bg-amber-50/5 p-3 space-y-1">
        <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
          Confusion Pattern
        </p>
        <p className="text-sm text-foreground">{content.confusionPattern}</p>
      </div>

      {/* Terms list (no definitions) */}
      <div className="rounded border border-border bg-muted/30 p-3 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Confusable Terms
        </p>
        <div className="flex flex-wrap gap-2 mt-1">
          {content.items.map((item) => (
            <span
              key={item.term}
              className="rounded-full bg-muted px-3 py-1 text-sm font-medium text-foreground border border-border"
            >
              {item.term}
            </span>
          ))}
        </div>
      </div>

      {!props.isRevealed && (
        <p className="text-sm text-muted-foreground italic">
          Can you distinguish each term? Reveal to see definitions and distinguishing features.
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
        {/* Each confusable item */}
        {content.items.map((item) => (
          <div key={item.term} className="rounded border border-border bg-muted/20 p-3 space-y-1.5">
            <p className="text-sm font-bold text-foreground">{item.term}</p>
            <p className="text-sm text-foreground">{item.definition}</p>
            <p className="text-xs text-synapse-400">
              <span className="font-semibold">Key feature: </span>
              {item.distinguishingFeature}
            </p>
          </div>
        ))}

        {content.explanation !== undefined && content.explanation !== '' && (
          <p className="text-sm text-muted-foreground border-t border-border pt-3">
            {content.explanation}
          </p>
        )}
      </div>
    </CardShell>
  );
}
