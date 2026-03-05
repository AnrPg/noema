'use client';

/**
 * @noema/web - Card Renderers
 * AtomicRenderer — simple front/back flip card.
 */

import * as React from 'react';
import type { IAtomicContent } from '@noema/api-client';
import { CardShell } from './card-shell.js';
import type { ICardRendererProps } from './types.js';

export default function AtomicRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode, isRevealed } = props;
  const content = card.content as unknown as IAtomicContent;

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        {content.front ?? <span className="text-muted-foreground italic">No front content</span>}
      </CardShell>
    );
  }

  return (
    <CardShell {...props} {...(content.hint !== undefined ? { hint: content.hint } : {})}>
      <p className="text-base font-medium text-foreground">{content.front}</p>
      {isRevealed && <p className="text-base text-foreground">{content.back}</p>}
    </CardShell>
  );
}
