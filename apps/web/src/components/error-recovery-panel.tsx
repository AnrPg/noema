'use client';

import { useMemo, useState } from 'react';
import { Button, Card, CardContent, cn } from '@noema/ui';
import { Activity, Brain, RefreshCcw, Sparkles } from 'lucide-react';
import { BrainMazeGame } from '@/components/error-games/brain-maze-game';
import { NeuralTimingGame } from '@/components/error-games/neural-timing-game';

type PanelState = 'selection' | 'neuralTiming' | 'brainMaze';

interface IErrorRecoveryPanelProps {
  onRetry?: () => void;
}

interface IGameCard {
  id: Exclude<PanelState, 'selection'>;
  title: string;
  description: string;
  preview: React.JSX.Element;
}

function NeuralTimingPreview(): React.JSX.Element {
  return (
    <div className="relative grid h-28 grid-cols-2 gap-3 overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_center,hsl(var(--synapse-900)/0.88),transparent_76%)] p-3">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,hsl(var(--dendrite-400)/0.2),transparent_30%)]" />
      <div className="flex items-center justify-center">
        <div className="flex h-full w-full items-center justify-center rounded-[22px] border border-white/10 bg-black/15">
          <div className="h-10 w-10 rounded-full border border-cyan-300/25 bg-gradient-to-br from-cyan-400/85 to-sky-500/85 shadow-[0_0_16px_rgba(34,211,238,0.28)]" />
        </div>
      </div>
      <div className="flex items-center justify-center">
        <div className="flex h-full w-full items-center justify-center rounded-[22px] border border-white/10 bg-black/15">
          <div className="h-10 w-10 border border-fuchsia-300/25 bg-gradient-to-br from-fuchsia-400/85 to-violet-500/85 shadow-[0_0_16px_rgba(217,70,239,0.26)] [clip-path:polygon(50%_0%,100%_50%,50%_100%,0%_50%)]" />
        </div>
      </div>
      <div className="flex items-center justify-center">
        <div className="flex h-full w-full items-center justify-center rounded-[22px] border border-white/10 bg-black/15">
          <div className="h-10 w-16 border border-amber-200/30 bg-gradient-to-br from-amber-300/90 to-orange-400/85 shadow-[0_0_16px_rgba(251,191,36,0.26)] [clip-path:polygon(50%_6%,100%_42%,82%_100%,18%_100%,0%_42%)]" />
        </div>
      </div>
      <div className="flex items-center justify-center">
        <div className="flex h-full w-full items-center justify-center rounded-[22px] border border-white/10 bg-black/15">
          <div className="h-10 w-16 border border-emerald-200/25 bg-gradient-to-br from-emerald-300/85 to-green-500/85 shadow-[0_0_16px_rgba(52,211,153,0.24)] [clip-path:polygon(18%_4%,82%_4%,100%_50%,82%_96%,18%_96%,0%_50%)]" />
        </div>
      </div>
    </div>
  );
}

function BrainMazePreview(): React.JSX.Element {
  return (
    <div className="relative h-28 overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(145deg,hsl(var(--dendrite-900)/0.8),hsl(var(--background)/0.92))] p-3">
      <div className="grid h-full grid-cols-7 gap-1">
        {Array.from({ length: 35 }, (_, index) => {
          const isWall = [0, 1, 5, 7, 9, 11, 13, 15, 19, 21, 23, 25, 27, 29, 33, 34].includes(
            index
          );
          return (
            <div
              key={index}
              className={cn('rounded-[8px]', isWall ? 'bg-synapse-400/20' : 'bg-white/5')}
            />
          );
        })}
      </div>
      <div className="error-preview-signal absolute left-5 top-1/2 h-3.5 w-3.5 rounded-full bg-neuron-400 shadow-[0_0_16px_hsl(var(--neuron-400)/0.6)]" />
      <div className="absolute right-6 top-5 h-3.5 w-3.5 rounded-full bg-cortex-400 shadow-[0_0_16px_hsl(var(--cortex-400)/0.55)]" />
      <div className="absolute bottom-4 right-8 text-sm drop-shadow-[0_0_10px_rgba(251,191,36,0.45)]">
        💡
      </div>
    </div>
  );
}

export function ErrorRecoveryPanel({ onRetry }: IErrorRecoveryPanelProps): React.JSX.Element {
  const [panelState, setPanelState] = useState<PanelState>('selection');
  const [sessionKey, setSessionKey] = useState(0);

  const cards = useMemo<IGameCard[]>(
    () => [
      {
        id: 'neuralTiming',
        title: 'Neural Recall',
        description: 'Memorize the firing order',
        preview: <NeuralTimingPreview />,
      },
      {
        id: 'brainMaze',
        title: 'Brain Maze',
        description: 'Navigate signal through memory gaps',
        preview: <BrainMazePreview />,
      },
    ],
    []
  );

  const handleRetry = (): void => {
    if (onRetry !== undefined) {
      onRetry();
      return;
    }

    window.location.reload();
  };

  const startGame = (nextState: Exclude<PanelState, 'selection'>): void => {
    setPanelState(nextState);
    setSessionKey((current) => current + 1);
  };

  const renderGame = (): React.JSX.Element | null => {
    switch (panelState) {
      case 'neuralTiming':
        return (
          <NeuralTimingGame
            sessionKey={sessionKey}
            onBack={() => {
              setPanelState('selection');
            }}
          />
        );
      case 'brainMaze':
        return (
          <BrainMazeGame
            sessionKey={sessionKey}
            onBack={() => {
              setPanelState('selection');
            }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-5">
      <Card className="relative overflow-hidden border-white/10 bg-white/5 shadow-[0_30px_80px_rgba(0,0,0,0.4)] backdrop-blur-xl">
        <div
          className="absolute inset-0 bg-[linear-gradient(145deg,hsl(var(--background)/0.08),transparent_45%,hsl(var(--synapse-400)/0.08))]"
          aria-hidden="true"
        />
        <CardContent className="relative space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-axon-100/65">Observatory</p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">Stability monitor</h2>
            </div>
            <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 font-mono text-xs text-axon-100/75">
              runtime.recovering
            </div>
          </div>

          {panelState === 'selection' ? (
            <div className="error-panel-stage space-y-5">
              <div className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,hsl(var(--synapse-900)/0.82),hsl(var(--background)/0.92)_55%,hsl(var(--axon-900))_100%)] p-5 shadow-[inset_0_0_40px_rgba(96,165,250,0.08)]">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-synapse-400/10 p-2.5">
                    <Activity className="h-5 w-5 text-synapse-100" aria-hidden="true" />
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm leading-6 text-white/78">
                      While we stabilize the cortex, you can:
                    </p>
                    <ul className="space-y-1 text-sm leading-6 text-white/64">
                      <li>• Retry the operation</li>
                      <li>• Or play a quick neural mini-game</li>
                    </ul>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/10 bg-black/25 text-white hover:bg-white/10"
                      onClick={handleRetry}
                    >
                      <RefreshCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                      Retry
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {cards.map((card) => (
                  <div
                    key={card.id}
                    className="rounded-[28px] border border-white/10 bg-black/20 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.24)] backdrop-blur-md"
                  >
                    <div className="space-y-4">
                      {card.preview}
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div className="space-y-1">
                          <h3 className="text-lg font-semibold text-white">{card.title}</h3>
                          <p className="text-sm text-white/65">{card.description}</p>
                        </div>
                        <Button
                          type="button"
                          className="rounded-2xl px-5 shadow-[0_0_24px_hsl(var(--synapse-400)/0.22)]"
                          onClick={() => {
                            startGame(card.id);
                          }}
                        >
                          <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                          Play
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="error-panel-stage space-y-4">
              <div className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,hsl(var(--synapse-900)/0.82),hsl(var(--background)/0.92)_55%,hsl(var(--axon-900))_100%)] p-4 shadow-[inset_0_0_40px_rgba(96,165,250,0.08)]">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-synapse-400/10 p-2.5">
                    <Brain className="h-5 w-5 text-synapse-100" aria-hidden="true" />
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-white/84">Recovery in progress...</p>
                    <p className="text-sm leading-6 text-white/66">
                      Play while we fix the neural pathways, or retry anytime.
                    </p>
                    <Button
                      type="button"
                      className="rounded-2xl px-5 shadow-[0_0_24px_hsl(var(--synapse-400)/0.22)]"
                      onClick={handleRetry}
                    >
                      <RefreshCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                      Retry
                    </Button>
                  </div>
                </div>
              </div>

              {renderGame()}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
