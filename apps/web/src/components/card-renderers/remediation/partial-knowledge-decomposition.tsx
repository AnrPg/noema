'use client';

/**
 * @noema/web - Card Renderers
 * PartialKnowledgeDecompositionRenderer — identifies known vs unknown parts and provides a bridging strategy.
 */

import * as React from 'react';
import type { IPartialKnowledgeDecompositionContent } from '@noema/api-client';
import { CardShell } from '../card-shell';
import type { ICardRendererProps } from '../types';

export default function PartialKnowledgeDecompositionRenderer(
  props: ICardRendererProps
): React.JSX.Element {
  const { card, mode } = props;
  const content = card.content as unknown as IPartialKnowledgeDecompositionContent;

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="font-medium line-clamp-1">{content.concept}</span>
        <span className="text-muted-foreground text-xs ml-1">· partial knowledge</span>
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

      {/* Known parts — shown before reveal */}
      {content.knownParts.length > 0 && (
        <div className="rounded border border-green-500/30 bg-green-50/5 p-3 space-y-2">
          <p className="text-xs font-semibold text-green-400 uppercase tracking-wide">
            What You Know ({String(content.knownParts.length)})
          </p>
          <ul className="space-y-1">
            {content.knownParts.map((part, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-foreground">
                <span className="text-green-400 mt-0.5">✓</span>
                {part}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!props.isRevealed && (
        <p className="text-sm text-muted-foreground italic">
          What are the gaps in your knowledge and how can you bridge them? Reveal to see.
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
        {/* Unknown parts */}
        {content.unknownParts.length > 0 && (
          <div className="rounded border border-red-500/30 bg-red-50/5 p-3 space-y-2">
            <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">
              Gaps to Fill ({String(content.unknownParts.length)})
            </p>
            <ul className="space-y-1">
              {content.unknownParts.map((part, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-foreground">
                  <span className="text-red-400 mt-0.5">✗</span>
                  {part}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Bridging strategy */}
        <div className="rounded border border-synapse-400/30 bg-muted/20 p-3 space-y-1">
          <p className="text-xs font-semibold text-synapse-400 uppercase tracking-wide">
            Bridging Strategy
          </p>
          <p className="text-sm text-foreground">{content.bridgingStrategy}</p>
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
