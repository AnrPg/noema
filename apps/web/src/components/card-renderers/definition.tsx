'use client';

/**
 * @noema/web - Card Renderers
 * DefinitionRenderer — term/definition flip card.
 */

import * as React from 'react';
import type { IDefinitionContent } from '@noema/api-client';
import { CardShell } from './card-shell.js';
import type { ICardRendererProps } from './types.js';

export default function DefinitionRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode, isRevealed } = props;
  const content = card.content as unknown as IDefinitionContent;

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="font-bold text-foreground">{content.term}</span>
        {content.partOfSpeech !== undefined && (
          <span className="text-muted-foreground ml-1">({content.partOfSpeech})</span>
        )}
      </CardShell>
    );
  }

  return (
    <CardShell {...props} {...(content.hint !== undefined ? { hint: content.hint } : {})}>
      <p className="text-base font-bold text-foreground">{content.term}</p>
      {isRevealed && (
        <div className="space-y-2">
          <p className="text-base text-foreground">{content.definition}</p>
          {content.examples !== undefined && content.examples.length > 0 && (
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              {content.examples.map((example, i) => (
                <li key={i}>{example}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </CardShell>
  );
}
