'use client';

/**
 * @noema/web - Card Renderers
 * AssumptionCheckRenderer — surfaces a hidden assumption in a statement and its consequence.
 */

import * as React from 'react';
import type { IAssumptionCheckContent } from '@noema/api-client';
import { CardShell } from '../card-shell';
import type { ICardRendererProps } from '../types';

export default function AssumptionCheckRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode } = props;
  const content = card.content as unknown as IAssumptionCheckContent;

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="font-medium line-clamp-1">{content.statement}</span>
        <span className="text-muted-foreground text-xs ml-1">· assumption check</span>
      </CardShell>
    );
  }

  const actionSlot = (
    <div className="space-y-4">
      {/* Statement */}
      <div className="rounded border border-border bg-muted/30 p-3 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Statement
        </p>
        <p className="text-base font-medium text-foreground">{content.statement}</p>
      </div>

      {!props.isRevealed && (
        <p className="text-sm text-muted-foreground italic">
          What hidden assumption does this statement rely on? Reveal to see the assumption and its
          consequence.
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
        {/* Hidden Assumption */}
        <div className="rounded border border-amber-500/40 bg-amber-50/10 p-3 space-y-1">
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
            Hidden Assumption
          </p>
          <p className="text-sm text-foreground">{content.hiddenAssumption}</p>
        </div>

        {/* Consequence */}
        <div className="rounded border border-border bg-muted/20 p-3 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Consequence
          </p>
          <p className="text-sm text-foreground">{content.consequence}</p>
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
