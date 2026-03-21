'use client';

/**
 * @noema/web - Card Renderers
 * CardShell — layout wrapper shared by all interactive card renderer components.
 */

import * as React from 'react';
import { Card, CardContent, Button } from '@noema/ui';
import type { ICardRendererProps } from './types';

interface ICardShellProps extends ICardRendererProps {
  children?: React.ReactNode;
  hint?: string; // optional hint text to display
  actions?: React.ReactNode; // pre-reveal interactive controls (buttons) for interactive renderers
}

export function CardShell({
  card,
  mode,
  isRevealed,
  onReveal,
  hint,
  actions,
  children,
  className = '',
}: ICardShellProps): React.JSX.Element {
  if (mode === 'preview') {
    return (
      <Card className={`h-full ${className}`}>
        <CardContent className="p-4">
          <span className="text-xs text-muted-foreground font-mono mb-2 block">
            {card.cardType}
          </span>
          <div className="text-sm text-foreground line-clamp-3">{children}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`w-full ${className}`}>
      <CardContent className="p-6 space-y-4">
        {hint !== undefined && hint !== '' && !isRevealed && (
          <p className="text-sm text-muted-foreground italic border-l-2 border-synapse-400/40 pl-3">
            Hint: {hint}
          </p>
        )}

        {actions !== undefined && actions}

        {!isRevealed && onReveal !== undefined && actions === undefined && (
          <Button
            variant="outline"
            size="sm"
            onClick={onReveal}
            aria-label={`Show answer for card ${card.id}`}
          >
            Show Answer
          </Button>
        )}

        {isRevealed && (
          <>
            <div className="border-t border-border my-2" />
            {children}
          </>
        )}
      </CardContent>
    </Card>
  );
}
