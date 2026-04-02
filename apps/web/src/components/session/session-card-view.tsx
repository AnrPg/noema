'use client';

import * as React from 'react';
import type { ICardDto } from '@noema/api-client';
import { Button, Card, CardContent } from '@noema/ui';

import {
  deriveSessionCardSides,
  getAnswerSides,
  getPromptSide,
  type ISessionCardSide,
  type ISessionPresentationPreferences,
} from '@/lib/session-card-sides';

interface ISessionCardViewProps {
  card: ICardDto;
  isRevealed: boolean;
  onReveal?: () => void;
  preferences?: ISessionPresentationPreferences;
}

function SidePanel({
  side,
  tone = 'default',
}: {
  side: ISessionCardSide;
  tone?: 'default' | 'primary';
}): React.JSX.Element {
  return (
    <div
      className={[
        'overflow-hidden rounded-2xl border p-4 shadow-sm sm:p-5',
        tone === 'primary'
          ? 'border-cyan-400/30 bg-[linear-gradient(180deg,rgba(34,211,238,0.14),rgba(15,23,42,0.92))] shadow-[0_12px_40px_rgba(8,145,178,0.18)]'
          : 'border-sky-400/15 bg-[linear-gradient(180deg,rgba(59,130,246,0.08),rgba(15,23,42,0.84))] shadow-[0_10px_30px_rgba(2,6,23,0.16)]',
      ].join(' ')}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
        {side.label}
      </p>
      <div className="mt-3 max-h-[min(40vh,18rem)] overflow-y-auto overscroll-contain pr-2">
        <p className="whitespace-pre-wrap text-base leading-7 text-foreground sm:text-lg sm:leading-8">
          {side.value}
        </p>
      </div>
    </div>
  );
}

export function SessionCardView({
  card,
  isRevealed,
  onReveal,
  preferences,
}: ISessionCardViewProps): React.JSX.Element {
  const [isHintVisible, setIsHintVisible] = React.useState(false);
  const [visibleOtherCount, setVisibleOtherCount] = React.useState(0);

  React.useEffect(() => {
    setIsHintVisible(false);
    setVisibleOtherCount(0);
  }, [card.id]);

  const allSides = React.useMemo(() => deriveSessionCardSides(card), [card]);
  const hintSide = allSides.find((side) => side.key === 'hint') ?? null;
  const visibleSides = allSides.filter((side) => side.key !== 'hint');
  const promptSide = getPromptSide(visibleSides, preferences);
  const { primary, others } = getAnswerSides(visibleSides, preferences);
  const revealMode = preferences?.revealMode ?? 'all_at_once';
  const progressiveOthers = revealMode === 'one_then_more' ? others.slice(0, visibleOtherCount) : [];

  return (
    <Card className="w-full overflow-hidden rounded-[2rem] border border-border/80 bg-card/95 shadow-[0_24px_80px_rgba(2,6,23,0.24)]">
      <CardContent className="flex min-h-[22rem] flex-col gap-5 p-4 sm:p-6 md:min-h-[28rem] md:p-8">
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
                {card.cardType.replace(/_/g, ' ')}
              </p>
              {promptSide !== null && (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Showing <span className="text-foreground">{promptSide.label}</span> first
                </p>
              )}
            </div>
            {!isRevealed && hintSide !== null && (
              <Button
                type="button"
                variant="ghost"
                className="self-start rounded-full border border-border/60 px-4 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setIsHintVisible((current) => !current);
                }}
              >
                {isHintVisible ? 'Hide hint' : 'Show hint'}
              </Button>
            )}
          </div>

          {isHintVisible && hintSide !== null && (
            <div className="rounded-2xl border border-amber-400/35 bg-[linear-gradient(135deg,rgba(245,158,11,0.16),rgba(236,72,153,0.08),rgba(15,23,42,0.92))] px-4 py-4 sm:px-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-200/80">
                Hint
              </p>
              <div className="mt-3 max-h-40 overflow-y-auto overscroll-contain pr-2">
                <p className="whitespace-pre-wrap text-base leading-7 text-amber-50/95">
                  {hintSide.value}
                </p>
              </div>
            </div>
          )}

          {promptSide !== null ? (
            <SidePanel side={promptSide} tone="primary" />
          ) : (
            <div className="rounded-2xl border border-border/70 bg-background/80 p-5 text-muted-foreground">
              No readable side content found for this card.
            </div>
          )}

          {isRevealed && (
            <div className="space-y-4">
              {primary !== null && <SidePanel side={primary} />}

              {revealMode === 'all_at_once' && others.length > 0 && (
                <div className="grid gap-4 md:grid-cols-2">
                  {others.map((side) => (
                    <SidePanel key={side.key} side={side} />
                  ))}
                </div>
              )}

              {revealMode === 'one_then_more' && progressiveOthers.length > 0 && (
                <div className="grid gap-4 md:grid-cols-2">
                  {progressiveOthers.map((side) => (
                    <SidePanel key={side.key} side={side} />
                  ))}
                </div>
              )}

              {revealMode === 'one_then_more' && others.length > visibleOtherCount && (
                <Button
                  type="button"
                  variant="outline"
                  className="self-start rounded-full px-5"
                  onClick={() => {
                    setVisibleOtherCount((current) => Math.min(current + 1, others.length));
                  }}
                >
                  See another side
                </Button>
              )}
            </div>
          )}
        </div>

        {!isRevealed && onReveal !== undefined && (
          <div className="mt-auto pt-2">
            <Button
              variant="outline"
              size="lg"
              className="rounded-full border-border/70 px-6"
              onClick={onReveal}
              aria-label={`Show answer for card ${card.id}`}
            >
              Show Answer
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
