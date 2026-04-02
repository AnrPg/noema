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
  onHintRequest,
  onReveal,
  hint,
  actions,
  children,
  className = '',
}: ICardShellProps): React.JSX.Element {
  const [isHintVisible, setIsHintVisible] = React.useState(false);

  React.useEffect(() => {
    setIsHintVisible(false);
  }, [card.id]);

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
          <div className="space-y-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-0 text-xs uppercase tracking-[0.22em] text-muted-foreground hover:bg-transparent hover:text-foreground"
              onClick={() => {
                setIsHintVisible((current) => !current);
                if (!isHintVisible) {
                  onHintRequest?.();
                }
              }}
            >
              {isHintVisible ? 'Hide hint' : 'Show hint'}
            </Button>
            {isHintVisible && (
              <div className="rounded-2xl border border-amber-400/35 bg-[linear-gradient(135deg,rgba(245,158,11,0.12),rgba(236,72,153,0.08),rgba(15,23,42,0.94))] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-200/80">
                  Hint
                </p>
                <p className="mt-2 text-sm italic leading-6 text-amber-50/95">{hint}</p>
              </div>
            )}
          </div>
        )}

        {actions !== undefined && actions}

        {actions === undefined && children}

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
            {actions !== undefined && (
              <>
                <div className="border-t border-border my-2" />
                {children}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
