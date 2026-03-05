'use client';

/**
 * @noema/web - Card Renderers
 * CardShell — layout wrapper shared by all interactive card renderer components.
 */

import * as React from 'react';
import { Card, CardContent } from '@noema/ui';
import type { CardRendererMode } from './types.js';

interface ICardShellProps {
  mode: CardRendererMode;
  frontContent: React.ReactNode;
  backContent?: React.ReactNode;
  isRevealed: boolean;
  onReveal?: () => void;
  hint?: string;
  children?: React.ReactNode;
  className?: string;
}

export function CardShell({
  mode,
  frontContent,
  backContent,
  isRevealed,
  onReveal,
  hint,
  children,
  className = '',
}: ICardShellProps): React.JSX.Element {
  if (mode === 'preview') {
    return (
      <Card className={`h-full ${className}`}>
        <CardContent className="p-4">
          <div className="text-sm text-foreground line-clamp-3">{frontContent}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`w-full ${className}`}>
      <CardContent className="p-6 space-y-4">
        <div className="text-base leading-relaxed">{frontContent}</div>

        {!isRevealed && hint !== undefined && hint !== '' && (
          <p className="text-sm text-muted-foreground italic border-l-2 border-synapse-400/40 pl-3">
            Hint: {hint}
          </p>
        )}

        {isRevealed && backContent !== undefined && (
          <>
            <div className="border-t border-border" />
            <div className="text-base leading-relaxed text-foreground/90">{backContent}</div>
          </>
        )}

        {!isRevealed && onReveal !== undefined && backContent !== undefined && (
          <button
            type="button"
            onClick={onReveal}
            className="w-full rounded-lg border border-synapse-400/30 py-2 text-sm text-synapse-400 hover:bg-synapse-400/5 transition-colors"
          >
            Show Answer
          </button>
        )}

        {children}
      </CardContent>
    </Card>
  );
}
