'use client';

/**
 * @noema/web - Card Renderers
 * EncodingRepairRenderer — corrects a faulty mental encoding by contrasting it with the correct one.
 */

import * as React from 'react';
import type { IEncodingRepairContent } from '@noema/api-client';
import { CardShell } from '../card-shell.js';
import type { ICardRendererProps } from '../types.js';

export default function EncodingRepairRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode } = props;
  const content = card.content as unknown as IEncodingRepairContent;

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="font-medium line-clamp-1">{content.concept}</span>
        <span className="text-muted-foreground text-xs ml-1">· encoding repair</span>
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

      {/* Incorrect encoding */}
      <div className="rounded border border-red-500/30 bg-red-50/5 p-3 space-y-1">
        <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">
          Incorrect Encoding
        </p>
        <p className="text-sm text-foreground">{content.incorrectEncoding}</p>
      </div>

      {!props.isRevealed && (
        <p className="text-sm text-muted-foreground italic">
          What is the correct encoding for this concept, and how should it be repaired? Reveal to
          see the correction and repair strategy.
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
        {/* Correct encoding */}
        <div className="rounded border border-green-500/30 bg-green-50/5 p-3 space-y-1">
          <p className="text-xs font-semibold text-green-400 uppercase tracking-wide">
            Correct Encoding
          </p>
          <p className="text-sm text-foreground">{content.correctEncoding}</p>
        </div>

        {/* Repair strategy */}
        <div className="rounded border border-synapse-500/30 bg-synapse-500/5 p-3 space-y-1">
          <p className="text-xs font-semibold text-synapse-400 uppercase tracking-wide">
            Repair Strategy
          </p>
          <p className="text-sm text-foreground">{content.repairStrategy}</p>
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
