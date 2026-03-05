'use client';

/**
 * @noema/web - Card Renderers
 * AvailabilityBiasDisconfirmationRenderer — counters a biased belief with evidence and base rates.
 */

import * as React from 'react';
import type { IAvailabilityBiasDisconfirmationContent } from '@noema/api-client';
import { CardShell } from '../card-shell.js';
import type { ICardRendererProps } from '../types.js';

export default function AvailabilityBiasDisconfirmationRenderer(
  props: ICardRendererProps
): React.JSX.Element {
  const { card, mode } = props;
  const content = card.content as unknown as IAvailabilityBiasDisconfirmationContent;

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="font-medium line-clamp-1">{content.biasedBelief}</span>
        <span className="text-muted-foreground text-xs ml-1">· availability bias</span>
      </CardShell>
    );
  }

  const actionSlot = (
    <div className="space-y-4">
      {/* Biased belief */}
      <div className="rounded border border-red-500/30 bg-red-50/5 p-3 space-y-1">
        <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">Biased Belief</p>
        <p className="text-base font-medium text-foreground">{content.biasedBelief}</p>
      </div>

      {!props.isRevealed && (
        <p className="text-sm text-muted-foreground italic">
          What evidence or base rate disconfirms this belief? Reveal to see.
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
        {/* Evidence */}
        <div className="rounded border border-green-500/30 bg-green-50/5 p-3 space-y-1">
          <p className="text-xs font-semibold text-green-400 uppercase tracking-wide">Evidence</p>
          <p className="text-sm text-foreground">{content.evidence}</p>
        </div>

        {/* Base Rate (optional) */}
        {content.baseRate !== undefined && content.baseRate !== '' && (
          <div className="rounded border border-synapse-400/30 bg-muted/20 p-3 space-y-1">
            <p className="text-xs font-semibold text-synapse-400 uppercase tracking-wide">
              Base Rate
            </p>
            <p className="text-sm text-foreground">{content.baseRate}</p>
          </div>
        )}

        {/* Bias explanation (optional) */}
        {content.biasExplanation !== undefined && content.biasExplanation !== '' && (
          <div className="rounded border border-amber-500/30 bg-amber-50/5 p-3 space-y-1">
            <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
              Why This Bias Occurs
            </p>
            <p className="text-sm text-foreground">{content.biasExplanation}</p>
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
