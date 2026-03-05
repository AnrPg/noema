'use client';

/**
 * @noema/web - Card Renderers
 * OldVsNewDefinitionRenderer — contrasts superseded and current definition of a term.
 */

import * as React from 'react';
import type { IOldVsNewDefinitionContent } from '@noema/api-client';
import { CardShell } from '../card-shell.js';
import type { ICardRendererProps } from '../types.js';

export default function OldVsNewDefinitionRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode } = props;
  const content = card.content as unknown as IOldVsNewDefinitionContent;

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="font-medium line-clamp-1">{content.term}</span>
        <span className="text-muted-foreground text-xs ml-1">· old vs new definition</span>
      </CardShell>
    );
  }

  const actionSlot = (
    <div className="space-y-4">
      {/* Term heading */}
      <div className="rounded border border-border bg-muted/30 p-3 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Term</p>
        <p className="text-lg font-semibold text-foreground">{content.term}</p>
      </div>

      {/* Old definition */}
      <div className="rounded border border-red-500/30 bg-red-50/5 p-3 space-y-1">
        <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">
          Old Definition (superseded)
        </p>
        <p className="text-sm text-foreground line-through decoration-red-400/60">
          {content.oldDefinition}
        </p>
      </div>

      {!props.isRevealed && (
        <p className="text-sm text-muted-foreground italic">
          This definition was revised — reveal the current definition and reason for change.
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
        {/* New definition */}
        <div className="rounded border border-green-500/30 bg-green-50/5 p-3 space-y-1">
          <p className="text-xs font-semibold text-green-400 uppercase tracking-wide">
            Current Definition
          </p>
          <p className="text-sm font-medium text-foreground">{content.newDefinition}</p>
        </div>

        {/* Change reason */}
        <div className="rounded border border-border bg-muted/20 p-3 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Why it changed
          </p>
          <p className="text-sm text-foreground">{content.changeReason}</p>
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
