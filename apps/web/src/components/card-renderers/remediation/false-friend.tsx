'use client';

/**
 * @noema/web - Card Renderers
 * FalseFriendRenderer — two terms that appear related but differ in actual meaning.
 */

import * as React from 'react';
import type { IFalseFriendContent } from '@noema/api-client';
import { CardShell } from '../card-shell';
import type { ICardRendererProps } from '../types';

export default function FalseFriendRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode } = props;
  const content = card.content as unknown as IFalseFriendContent;

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="font-medium line-clamp-1">
          {content.termA} vs {content.termB}
        </span>
        <span className="text-muted-foreground text-xs ml-1">· false friend</span>
      </CardShell>
    );
  }

  const actionSlot = (
    <div className="space-y-4">
      {/* False friend pair */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded border border-amber-500/40 bg-amber-50/10 p-3 text-center">
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-1">
            Term A
          </p>
          <p className="text-lg font-semibold text-foreground">{content.termA}</p>
        </div>
        <div className="rounded border border-amber-500/40 bg-amber-50/10 p-3 text-center">
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-1">
            Term B
          </p>
          <p className="text-lg font-semibold text-foreground">{content.termB}</p>
        </div>
      </div>

      {content.domainContext !== undefined && content.domainContext !== '' && (
        <div className="rounded border border-border bg-muted/20 px-3 py-2">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold">Domain: </span>
            {content.domainContext}
          </p>
        </div>
      )}

      {!props.isRevealed && (
        <p className="text-sm text-muted-foreground italic">
          These look like they mean the same thing — but do they? Reveal the actual meaning.
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
        <div className="rounded border border-rose-500/30 bg-rose-50/5 p-4 space-y-1">
          <p className="text-xs font-semibold text-rose-400 uppercase tracking-wide">
            Actual Meaning
          </p>
          <p className="text-base font-medium text-foreground">{content.actualMeaning}</p>
        </div>
        {content.explanation !== undefined && content.explanation !== '' && (
          <p className="text-sm text-muted-foreground">{content.explanation}</p>
        )}
      </div>
    </CardShell>
  );
}
