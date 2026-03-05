'use client';

/**
 * @noema/web - Card Renderers
 * FallbackRenderer — placeholder used while individual type renderers are built (T6–T12).
 */

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@noema/ui';
import type { ICardRendererProps } from './types.js';

export function FallbackRenderer({ card, mode }: ICardRendererProps): React.JSX.Element {
  if (mode === 'preview') {
    return (
      <Card className="h-full">
        <CardContent className="p-4">
          <span className="text-xs text-muted-foreground font-mono">{card.cardType}</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-sm font-mono text-muted-foreground">{card.cardType}</CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="text-xs overflow-auto bg-muted rounded-md p-4 max-h-80">
          {JSON.stringify(card.content, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}
