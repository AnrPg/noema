'use client';

/**
 * @noema/web - Card Renderers
 * BoundaryCaseRenderer — edge case: does this instance belong inside or outside the concept?
 */

import * as React from 'react';
import type { IBoundaryCaseContent } from '@noema/api-client';
import { CardShell } from '../card-shell';
import type { ICardRendererProps } from '../types';

export default function BoundaryCaseRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode } = props;
  const content = card.content as unknown as IBoundaryCaseContent;

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="font-medium line-clamp-1">{content.concept}</span>
        <span className="text-muted-foreground text-xs ml-1">· boundary case</span>
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

      {/* Boundary condition */}
      <div className="rounded border border-amber-500/40 bg-amber-50/10 p-3 space-y-1">
        <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
          Boundary Condition
        </p>
        <p className="text-sm text-foreground">{content.boundaryCondition}</p>
      </div>

      {!props.isRevealed && (
        <p className="text-sm text-muted-foreground italic">
          Is this case included in the concept or excluded? Reveal to find out.
        </p>
      )}
    </div>
  );

  const verdictColor = content.isIncluded
    ? 'border-green-500/30 bg-green-50/5'
    : 'border-red-500/30 bg-red-50/5';
  const verdictLabel = content.isIncluded ? 'Included' : 'Excluded';
  const verdictTextColor = content.isIncluded ? 'text-green-400' : 'text-red-400';

  return (
    <CardShell
      {...props}
      {...(content.hint !== undefined ? { hint: content.hint } : {})}
      actions={actionSlot}
    >
      <div className="space-y-3">
        {/* Verdict */}
        <div className={`rounded border p-3 space-y-1 ${verdictColor}`}>
          <p className={`text-xs font-semibold uppercase tracking-wide ${verdictTextColor}`}>
            Verdict: {verdictLabel}
          </p>
        </div>

        {/* Reasoning */}
        <div className="rounded border border-border bg-muted/20 p-3 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Reasoning
          </p>
          <p className="text-sm text-foreground">{content.reasoning}</p>
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
