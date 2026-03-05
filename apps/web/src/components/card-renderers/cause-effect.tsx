'use client';

/**
 * @noema/web - Card Renderers
 * CauseEffectRenderer — cause → effect relationship card.
 * ICauseEffectContent has multiple causes[], effects[], and relationships[].
 */

import * as React from 'react';
import type { ICauseEffectContent } from '@noema/api-client';
import { CardShell } from './card-shell.js';
import type { ICardRendererProps } from './types.js';

export default function CauseEffectRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode } = props;
  const content = card.content as unknown as ICauseEffectContent;

  if (mode === 'preview') {
    const firstCause = content.causes[0]?.description ?? 'No cause';
    return (
      <CardShell {...props}>
        <span className="line-clamp-2 text-sm">{firstCause}</span>
      </CardShell>
    );
  }

  const actionSlot = (
    <div className="space-y-4">
      {/* Causes */}
      <div className="space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {content.causes.length === 1 ? 'Cause' : 'Causes'}
        </p>
        <ul className="space-y-1">
          {content.causes.map((cause, i) => (
            <li
              key={i}
              className="text-sm text-foreground p-2 rounded border border-amber-300 bg-amber-50"
            >
              {content.causes.length > 1 && (
                <span className="font-mono text-xs text-amber-600 mr-2">C{String(i + 1)}.</span>
              )}
              {cause.description}
            </li>
          ))}
        </ul>
      </div>

      {/* Arrow indicator */}
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <div className="flex-1 h-px bg-border" />
        <span className="text-lg">↓</span>
        <div className="flex-1 h-px bg-border" />
      </div>
    </div>
  );

  return (
    <CardShell
      {...props}
      {...(content.hint !== undefined ? { hint: content.hint } : {})}
      actions={actionSlot}
    >
      {/* Effects — passed as children to CardShell.
          CardShell gates children behind isRevealed in interactive mode,
          so this section is only rendered after the user reveals the card. */}
      <div className="space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {content.effects.length === 1 ? 'Effect' : 'Effects'}
        </p>
        <ul className="space-y-1">
          {content.effects.map((effect, i) => (
            <li
              key={i}
              className="text-sm text-foreground p-2 rounded border border-blue-300 bg-blue-50"
            >
              {content.effects.length > 1 && (
                <span className="font-mono text-xs text-blue-600 mr-2">E{String(i + 1)}.</span>
              )}
              {effect.description}
            </li>
          ))}
        </ul>
      </div>

      {/* Relationships */}
      {content.relationships.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Relationships
          </p>
          <ul className="space-y-1">
            {content.relationships.map((rel, i) => (
              <li key={i} className="text-sm text-muted-foreground">
                <span className="font-medium text-amber-700">C{String(rel.causeIndex + 1)}</span>
                {' → '}
                <span className="font-medium text-blue-700">E{String(rel.effectIndex + 1)}</span>
                {rel.explanation !== undefined && rel.explanation !== '' && (
                  <span className="ml-1 text-muted-foreground">— {rel.explanation}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {content.explanation !== undefined && content.explanation !== '' && (
        <p className="text-sm text-muted-foreground">{content.explanation}</p>
      )}
    </CardShell>
  );
}
