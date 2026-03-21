'use client';

/**
 * @noema/web - Card Renderers
 * ExceptionRenderer — rule + exception cases card.
 */

import * as React from 'react';
import type { IExceptionContent } from '@noema/api-client';
import { CardShell } from './card-shell';
import type { ICardRendererProps } from './types';

export default function ExceptionRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode } = props;
  const content = card.content as unknown as IExceptionContent;

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="font-medium line-clamp-2">{content.rule}</span>
        <span className="text-muted-foreground text-xs ml-1">
          · {String(content.exceptions.length)} exception
          {content.exceptions.length !== 1 ? 's' : ''}
        </span>
      </CardShell>
    );
  }

  const actionSlot = (
    <div className="space-y-4">
      {/* Rule block */}
      <div className="rounded border border-border bg-muted/30 p-4 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rule</p>
        <p className="text-base font-medium text-foreground">{content.rule}</p>
        {content.generalPrinciple !== undefined && content.generalPrinciple !== '' && (
          <p className="text-sm text-muted-foreground mt-1">{content.generalPrinciple}</p>
        )}
      </div>

      {/* Hint about exceptions */}
      {!props.isRevealed && (
        <p className="text-sm text-muted-foreground italic">
          When does this rule NOT apply? Reveal to see {String(content.exceptions.length)} exception
          {content.exceptions.length !== 1 ? 's' : ''}.
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
      {/* Exceptions — revealed after card flip */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Exceptions
        </p>
        {content.exceptions.map((exc) => (
          <div
            key={exc.condition}
            className="rounded border border-amber-500/30 bg-amber-50/10 p-3 space-y-1"
          >
            <p className="text-sm font-medium text-foreground">{exc.condition}</p>
            <p className="text-sm text-muted-foreground">{exc.explanation}</p>
          </div>
        ))}
        {content.exceptions.length === 0 && (
          <p className="text-sm text-muted-foreground italic">No exceptions listed.</p>
        )}
        {content.explanation !== undefined && content.explanation !== '' && (
          <p className="text-sm text-muted-foreground border-t border-border pt-3">
            {content.explanation}
          </p>
        )}
      </div>
    </CardShell>
  );
}
