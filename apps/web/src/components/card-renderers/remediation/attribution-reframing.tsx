'use client';

/**
 * @noema/web - Card Renderers
 * AttributionReframingRenderer — reframes an outcome from emotional to process attribution.
 */

import * as React from 'react';
import type { IAttributionReframingContent } from '@noema/api-client';
import { CardShell } from '../card-shell.js';
import type { ICardRendererProps } from '../types.js';

export default function AttributionReframingRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode } = props;
  const content = card.content as unknown as IAttributionReframingContent;

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="font-medium line-clamp-1">{content.outcome}</span>
        <span className="text-muted-foreground text-xs ml-1">· attribution reframing</span>
      </CardShell>
    );
  }

  const actionSlot = (
    <div className="space-y-4">
      {/* Outcome */}
      <div className="rounded border border-border bg-muted/30 p-3 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Outcome
        </p>
        <p className="text-base font-medium text-foreground">{content.outcome}</p>
      </div>

      {/* Emotional attribution */}
      <div className="rounded border border-red-500/30 bg-red-50/5 p-3 space-y-1">
        <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">
          Emotional Attribution
        </p>
        <p className="text-sm text-foreground">{content.emotionalAttribution}</p>
      </div>

      {!props.isRevealed && (
        <p className="text-sm text-muted-foreground italic">
          How would you reframe this attribution toward process? Reveal to see.
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
        {/* Process attribution */}
        <div className="rounded border border-green-500/30 bg-green-50/5 p-3 space-y-1">
          <p className="text-xs font-semibold text-green-400 uppercase tracking-wide">
            Process Attribution (Reframed)
          </p>
          <p className="text-sm text-foreground">{content.processAttribution}</p>
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
