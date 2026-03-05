'use client';

/**
 * @noema/web - Card Renderers
 * FallbackRenderer — placeholder used while individual type renderers are built (T6–T12).
 */

import * as React from 'react';
import { CardShell } from './card-shell.js';
import type { ICardRendererProps } from './types.js';

export function FallbackRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode } = props;

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="font-mono">{card.cardType}</span>
      </CardShell>
    );
  }

  return (
    <CardShell {...props}>
      <pre className="text-xs overflow-auto bg-muted rounded-md p-4 max-h-80">
        {JSON.stringify(card.content, null, 2)}
      </pre>
    </CardShell>
  );
}
