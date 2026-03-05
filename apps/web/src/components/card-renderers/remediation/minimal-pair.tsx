'use client';

/**
 * @noema/web - Card Renderers
 * MinimalPairRenderer — minimal difference comparison between two items.
 */

import * as React from 'react';
import type { IMinimalPairContent } from '@noema/api-client';
import { CardShell } from '../card-shell.js';
import type { ICardRendererProps } from '../types.js';

export default function MinimalPairRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode } = props;
  const content = card.content as unknown as IMinimalPairContent;

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="font-medium line-clamp-1">
          {content.itemA} / {content.itemB}
        </span>
        <span className="text-muted-foreground text-xs ml-1">· minimal pair</span>
      </CardShell>
    );
  }

  const actionSlot = (
    <div className="space-y-4">
      {/* The pair */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded border border-border bg-muted/30 p-3 text-center">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            A
          </p>
          <p className="text-lg font-semibold text-foreground">{content.itemA}</p>
        </div>
        <div className="rounded border border-border bg-muted/30 p-3 text-center">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            B
          </p>
          <p className="text-lg font-semibold text-foreground">{content.itemB}</p>
        </div>
      </div>

      {content.differenceContext !== undefined && content.differenceContext !== '' && (
        <p className="text-sm text-muted-foreground">{content.differenceContext}</p>
      )}

      {!props.isRevealed && (
        <p className="text-sm text-muted-foreground italic">
          What single feature distinguishes these? Reveal to see the discriminating feature.
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
        <div className="rounded border border-synapse-500/30 bg-synapse-50/5 p-4 space-y-1">
          <p className="text-xs font-semibold text-synapse-400 uppercase tracking-wide">
            Discriminating Feature
          </p>
          <p className="text-base font-medium text-foreground">{content.discriminatingFeature}</p>
        </div>
        {content.explanation !== undefined && content.explanation !== '' && (
          <p className="text-sm text-muted-foreground">{content.explanation}</p>
        )}
      </div>
    </CardShell>
  );
}
