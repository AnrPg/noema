'use client';

/**
 * @noema/web - Card Renderers
 * RepresentationSwitchRenderer — the same concept expressed in multiple representations.
 */

import * as React from 'react';
import type { IRepresentationSwitchContent } from '@noema/api-client';
import { CardShell } from '../card-shell';
import type { ICardRendererProps } from '../types';

export default function RepresentationSwitchRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode } = props;
  const content = card.content as unknown as IRepresentationSwitchContent;

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="font-medium line-clamp-1">{content.concept}</span>
        <span className="text-muted-foreground text-xs ml-1">
          · {String(content.representations.length)} representation
          {content.representations.length !== 1 ? 's' : ''}
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

      {!props.isRevealed && (
        <p className="text-sm text-muted-foreground italic">
          How does this concept look in different representations? Reveal to see all{' '}
          {String(content.representations.length)}.
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
          Representations
        </p>
        <div className="space-y-2">
          {content.representations.map((rep, idx) => (
            <div key={idx} className="rounded border border-border bg-muted/20 p-3 space-y-1">
              <p className="text-xs font-semibold text-synapse-400 uppercase tracking-wide">
                {rep.type}
              </p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{rep.content}</p>
            </div>
          ))}
          {content.representations.length === 0 && (
            <p className="text-sm text-muted-foreground italic">No representations defined.</p>
          )}
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
