'use client';

/**
 * @noema/web - Card Renderers
 * RuleScopeRenderer — when a rule applies vs when it does not.
 */

import * as React from 'react';
import type { IRuleScopeContent } from '@noema/api-client';
import { CardShell } from '../card-shell';
import type { ICardRendererProps } from '../types';

export default function RuleScopeRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode } = props;
  const content = card.content as unknown as IRuleScopeContent;

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="font-medium line-clamp-2">{content.rule}</span>
        <span className="text-muted-foreground text-xs ml-1">· rule scope</span>
      </CardShell>
    );
  }

  const actionSlot = (
    <div className="space-y-4">
      {/* Rule */}
      <div className="rounded border border-border bg-muted/30 p-4 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rule</p>
        <p className="text-base font-medium text-foreground">{content.rule}</p>
      </div>

      {!props.isRevealed && (
        <p className="text-sm text-muted-foreground italic">
          When does this rule apply — and when doesn&apos;t it? Reveal to see the scope.
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
        {/* Applies when */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-green-400 uppercase tracking-wide">
            Applies When
          </p>
          <ul className="space-y-1">
            {content.appliesWhen.map((condition, idx) => (
              <li key={idx} className="flex gap-2 text-sm text-foreground">
                <span className="text-green-400 shrink-0">&#x2713;</span>
                <span>{condition}</span>
              </li>
            ))}
            {content.appliesWhen.length === 0 && (
              <li className="text-sm text-muted-foreground italic">No conditions listed.</li>
            )}
          </ul>
        </div>

        {/* Does not apply when */}
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">
            Does NOT Apply When
          </p>
          <ul className="space-y-1">
            {content.doesNotApplyWhen.map((condition, idx) => (
              <li key={idx} className="flex gap-2 text-sm text-foreground">
                <span className="text-red-400 shrink-0">&#x2717;</span>
                <span>{condition}</span>
              </li>
            ))}
            {content.doesNotApplyWhen.length === 0 && (
              <li className="text-sm text-muted-foreground italic">No exclusions listed.</li>
            )}
          </ul>
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
