'use client';

/**
 * @noema/web - Card Renderers
 * CounterexampleRenderer — a claim is tested against a specific counterexample that refutes it.
 */

import * as React from 'react';
import type { ICounterexampleContent } from '@noema/api-client';
import { CardShell } from '../card-shell';
import type { ICardRendererProps } from '../types';

export default function CounterexampleRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode } = props;
  const content = card.content as unknown as ICounterexampleContent;

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="font-medium line-clamp-1">{content.claim}</span>
        <span className="text-muted-foreground text-xs ml-1">· counterexample</span>
      </CardShell>
    );
  }

  const actionSlot = (
    <div className="space-y-4">
      {/* Claim */}
      <div className="rounded border border-border bg-muted/30 p-3 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Claim</p>
        <p className="text-base font-medium text-foreground">{content.claim}</p>
      </div>

      {!props.isRevealed && (
        <p className="text-sm text-muted-foreground italic">
          Can you think of a specific case that disproves this claim? Reveal to see the
          counterexample.
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
        {/* Counterexample */}
        <div className="rounded border border-red-500/30 bg-red-50/5 p-3 space-y-1">
          <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">
            Counterexample
          </p>
          <p className="text-sm text-foreground">{content.counterexample}</p>
        </div>

        {/* Significance */}
        {content.significance !== undefined && content.significance !== '' && (
          <div className="rounded border border-border bg-muted/20 p-3 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Significance
            </p>
            <p className="text-sm text-foreground">{content.significance}</p>
          </div>
        )}

        {content.explanation !== undefined && content.explanation !== '' && (
          <p className="text-sm text-muted-foreground border-t border-border pt-3">
            {content.explanation}
          </p>
        )}
      </div>
    </CardShell>
  );
}
