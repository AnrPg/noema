'use client';

/**
 * @noema/web - Card Renderers
 * ContrastivePairRenderer — side-by-side contrast of two related concepts.
 */

import * as React from 'react';
import type { IContrastivePairContent } from '@noema/api-client';
import { CardShell } from '../card-shell';
import type { ICardRendererProps } from '../types';

export default function ContrastivePairRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode } = props;
  const content = card.content as unknown as IContrastivePairContent;

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="font-medium line-clamp-1">
          {content.itemA} vs {content.itemB}
        </span>
        <span className="text-muted-foreground text-xs ml-1">· contrastive pair</span>
      </CardShell>
    );
  }

  const actionSlot = (
    <div className="space-y-4">
      {/* Context */}
      <div className="rounded border border-border bg-muted/30 p-3 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Shared Context
        </p>
        <p className="text-base font-medium text-foreground">{content.sharedContext}</p>
      </div>

      {/* Side-by-side items */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded border border-blue-500/30 bg-blue-50/10 p-3">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-1">A</p>
          <p className="text-sm font-medium text-foreground">{content.itemA}</p>
        </div>
        <div className="rounded border border-violet-500/30 bg-violet-50/10 p-3">
          <p className="text-xs font-semibold text-violet-400 uppercase tracking-wide mb-1">B</p>
          <p className="text-sm font-medium text-foreground">{content.itemB}</p>
        </div>
      </div>

      {!props.isRevealed && (
        <p className="text-sm text-muted-foreground italic">
          What are the key differences? Reveal to see {String(content.keyDifferences.length)}{' '}
          difference
          {content.keyDifferences.length !== 1 ? 's' : ''}.
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
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Key Differences
        </p>
        <ul className="space-y-2">
          {content.keyDifferences.map((diff, idx) => (
            <li key={idx} className="flex gap-2 text-sm text-foreground">
              <span className="text-synapse-400 mt-0.5 shrink-0">&#x2022;</span>
              <span>{diff}</span>
            </li>
          ))}
          {content.keyDifferences.length === 0 && (
            <li className="text-sm text-muted-foreground italic">No differences listed.</li>
          )}
        </ul>
        {content.explanation !== undefined && content.explanation !== '' && (
          <p className="text-sm text-muted-foreground border-t border-border pt-3">
            {content.explanation}
          </p>
        )}
      </div>
    </CardShell>
  );
}
