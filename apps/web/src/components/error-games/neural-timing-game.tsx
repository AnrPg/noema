'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, cn } from '@noema/ui';
import { BookOpen, BrainCircuit, Network, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface INeuralTimingGameProps {
  sessionKey: number;
  onBack: () => void;
}

interface IPadDefinition {
  id: number;
  label: string;
  icon: LucideIcon;
  colorClassName: string;
  glowClassName: string;
  borderClassName: string;
  shapeClassName: string;
  activeStyle: React.CSSProperties;
}

const BASE_SEQUENCE_LENGTH = 2;
const PAD_DEFINITIONS: IPadDefinition[] = [
  {
    id: 0,
    label: 'Neuron',
    icon: BrainCircuit,
    colorClassName: 'from-cyan-400/85 to-sky-500/90',
    glowClassName: 'shadow-[0_0_32px_rgba(34,211,238,0.3)]',
    borderClassName: 'border-cyan-300/35',
    shapeClassName: 'rounded-full',
    activeStyle: {
      clipPath: 'circle(50% at 50% 50%)',
      boxShadow: '0 0 36px rgba(34, 211, 238, 0.55)',
    },
  },
  {
    id: 1,
    label: 'Pattern',
    icon: Network,
    colorClassName: 'from-fuchsia-400/85 to-violet-500/90',
    glowClassName: 'shadow-[0_0_32px_rgba(217,70,239,0.3)]',
    borderClassName: 'border-fuchsia-300/35',
    shapeClassName: 'rounded-[28px]',
    activeStyle: {
      clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
      boxShadow: '0 0 36px rgba(217, 70, 239, 0.52)',
    },
  },
  {
    id: 2,
    label: 'Insight',
    icon: Sparkles,
    colorClassName: 'from-amber-300/90 to-orange-400/90',
    glowClassName: 'shadow-[0_0_32px_rgba(251,191,36,0.32)]',
    borderClassName: 'border-amber-200/45',
    shapeClassName: 'rounded-[24px]',
    activeStyle: {
      clipPath: 'polygon(50% 2%, 96% 28%, 78% 98%, 22% 98%, 4% 28%)',
      boxShadow: '0 0 36px rgba(251, 191, 36, 0.52)',
    },
  },
  {
    id: 3,
    label: 'Recall',
    icon: BookOpen,
    colorClassName: 'from-emerald-300/90 to-green-500/90',
    glowClassName: 'shadow-[0_0_32px_rgba(52,211,153,0.3)]',
    borderClassName: 'border-emerald-200/40',
    shapeClassName: 'rounded-[34px]',
    activeStyle: {
      clipPath: 'polygon(20% 6%, 80% 6%, 100% 40%, 80% 94%, 20% 94%, 0% 40%)',
      boxShadow: '0 0 36px rgba(52, 211, 153, 0.5)',
    },
  },
];

function randomPadId(): number {
  const pad = PAD_DEFINITIONS[Math.floor(Math.random() * PAD_DEFINITIONS.length)];
  if (pad === undefined) {
    throw new Error('Expected pad definition.');
  }

  return pad.id;
}

export function NeuralTimingGame({
  sessionKey,
  onBack,
}: INeuralTimingGameProps): React.JSX.Element {
  const timersRef = useRef<number[]>([]);
  const sequenceRef = useRef<number[]>([]);
  const [runNonce, setRunNonce] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [sequence, setSequence] = useState<number[]>([]);
  const [roundLength, setRoundLength] = useState(BASE_SEQUENCE_LENGTH);
  const [inputIndex, setInputIndex] = useState(0);
  const [activePad, setActivePad] = useState<number | null>(null);
  const [pressedPad, setPressedPad] = useState<number | null>(null);
  const [phase, setPhase] = useState<'idle' | 'showing' | 'input' | 'between-rounds'>('idle');
  const [isGameOver, setIsGameOver] = useState(false);
  const [bestRound, setBestRound] = useState(BASE_SEQUENCE_LENGTH);

  const statusLabel = useMemo(() => {
    switch (phase) {
      case 'showing':
        return 'Observe the firing order';
      case 'input':
        return 'Repeat the same order';
      case 'between-rounds':
        return 'Sequence stabilized. Extending pattern...';
      default:
        return 'Ready for cognitive recovery';
    }
  }, [phase]);

  const clearTimers = (): void => {
    for (const timerId of timersRef.current) {
      window.clearTimeout(timerId);
    }
    timersRef.current = [];
  };

  const revealSequence = (nextSequence: number[], nextRoundLength: number): void => {
    clearTimers();
    sequenceRef.current = nextSequence;
    setSequence(nextSequence);
    setInputIndex(0);
    setActivePad(null);
    setPressedPad(null);
    setRoundLength(nextRoundLength);
    setPhase('showing');

    const flashDuration = Math.max(320, 520 - nextRoundLength * 12);
    const gapDuration = Math.max(180, 280 - nextRoundLength * 6);
    let elapsed = 240;

    nextSequence.forEach((padId, index) => {
      const startTimer = window.setTimeout(() => {
        setActivePad(padId);
      }, elapsed);
      timersRef.current.push(startTimer);

      elapsed += flashDuration;

      const endTimer = window.setTimeout(() => {
        setActivePad((current) => (current === padId ? null : current));
        if (index === nextSequence.length - 1) {
          const inputTimer = window.setTimeout(() => {
            setPhase('input');
          }, gapDuration + 90);
          timersRef.current.push(inputTimer);
        }
      }, elapsed);
      timersRef.current.push(endTimer);

      elapsed += gapDuration;
    });
  };

  const startRound = (nextSequence: number[]): void => {
    revealSequence(nextSequence, nextSequence.length);
  };

  const startGame = (): void => {
    setHasStarted(true);
    setIsGameOver(false);
    startRound([randomPadId(), randomPadId()]);
  };

  const replayGame = (): void => {
    clearTimers();
    setRunNonce((current) => current + 1);
  };

  useEffect(() => {
    clearTimers();
    sequenceRef.current = [];
    setHasStarted(false);
    setSequence([]);
    setRoundLength(BASE_SEQUENCE_LENGTH);
    setInputIndex(0);
    setActivePad(null);
    setPressedPad(null);
    setPhase('idle');
    setIsGameOver(false);
  }, [runNonce, sessionKey]);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, []);

  const handleLose = (): void => {
    clearTimers();
    setActivePad(null);
    setPressedPad(null);
    setIsGameOver(true);
    setPhase('idle');
    setBestRound((current) => Math.max(current, roundLength));
  };

  const handlePadPress = (padId: number): void => {
    if (!hasStarted || isGameOver || phase !== 'input') {
      return;
    }

    setPressedPad(padId);
    const releaseTimer = window.setTimeout(() => {
      setPressedPad((current) => (current === padId ? null : current));
    }, 170);
    timersRef.current.push(releaseTimer);

    const expectedPad = sequenceRef.current[inputIndex];
    if (expectedPad !== padId) {
      handleLose();
      return;
    }

    const nextInputIndex = inputIndex + 1;
    if (nextInputIndex >= sequenceRef.current.length) {
      const nextRoundLength = roundLength + 1;
      const nextSequence = [...sequenceRef.current, randomPadId()];
      setBestRound((current) => Math.max(current, nextRoundLength - 1));
      setInputIndex(0);
      setPhase('between-rounds');

      const nextRoundTimer = window.setTimeout(() => {
        startRound(nextSequence);
      }, 850);
      timersRef.current.push(nextRoundTimer);
      return;
    }

    setInputIndex(nextInputIndex);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">sequence</p>
          <p className="mt-1 font-mono text-lg text-synapse-100">{roundLength}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">progress</p>
          <p className="mt-1 font-mono text-lg text-neuron-100">
            {phase === 'input' ? inputIndex : 0}/
            {sequence.length > 0 ? sequence.length : roundLength}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">best</p>
          <p className="mt-1 font-mono text-lg text-myelin-100">{bestRound}</p>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,hsl(var(--synapse-900)/0.88),hsl(var(--background)/0.96)_55%,hsl(var(--axon-900))_100%)] px-4 py-5 shadow-[inset_0_0_40px_rgba(96,165,250,0.08)] sm:px-5">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,hsl(var(--synapse-400)/0.18),transparent_28%),radial-gradient(circle_at_80%_16%,hsl(var(--dendrite-400)/0.18),transparent_24%),radial-gradient(circle_at_52%_82%,hsl(var(--myelin-400)/0.14),transparent_26%)]"
          aria-hidden="true"
        />

        <div className="relative z-10 space-y-5">
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center">
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/45">
              cognitive recall
            </p>
            <p className="mt-1 text-sm text-white/76">{statusLabel}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {PAD_DEFINITIONS.map((pad) => {
              const Icon = pad.icon;
              const isActive = activePad === pad.id;
              const isPressed = pressedPad === pad.id;

              return (
                <button
                  key={pad.id}
                  type="button"
                  className={cn(
                    'group relative flex aspect-square items-center justify-center overflow-hidden border bg-gradient-to-br text-white transition duration-300',
                    pad.colorClassName,
                    pad.borderClassName,
                    pad.glowClassName,
                    pad.shapeClassName,
                    phase === 'input'
                      ? 'cursor-pointer hover:scale-[1.02] hover:brightness-110'
                      : 'cursor-default',
                    isActive || isPressed
                      ? 'scale-[1.03] brightness-125 saturate-150'
                      : 'opacity-92'
                  )}
                  style={isActive || isPressed ? pad.activeStyle : undefined}
                  onClick={() => {
                    handlePadPress(pad.id);
                  }}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.28),transparent_42%)]" />
                  <div className="absolute inset-[10%] rounded-[26px] border border-white/10 bg-black/10 backdrop-blur-[2px]" />
                  <div className="relative z-10 flex flex-col items-center gap-2">
                    <Icon className="h-8 w-8 drop-shadow-[0_0_10px_rgba(255,255,255,0.25)] sm:h-10 sm:w-10" />
                    <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/88">
                      {pad.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="pointer-events-none rounded-full border border-white/10 bg-black/20 px-3 py-1 text-center text-xs text-white/68 backdrop-blur-md">
            Watch the glowing order, then tap the same sequence from memory.
          </div>
        </div>

        {!hasStarted && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[rgba(4,9,20,0.64)] p-6 backdrop-blur-sm">
            <div className="max-w-sm rounded-3xl border border-white/10 bg-black/35 px-6 py-5 text-center shadow-[0_0_35px_rgba(96,165,250,0.16)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-synapse-100/78">
                Instructions
              </p>
              <p className="mt-3 text-lg font-semibold text-white">Memorize the firing order.</p>
              <p className="mt-2 text-sm leading-6 text-white/70">
                Four cognitive pads will glow one after another. Repeat the same order from memory.
                The first round shows two signals, then each round grows by one.
              </p>
              <Button
                type="button"
                className="mt-5 rounded-2xl px-5 shadow-[0_0_24px_hsl(var(--synapse-400)/0.22)]"
                onClick={startGame}
              >
                OK
              </Button>
            </div>
          </div>
        )}

        {isGameOver && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[rgba(4,9,20,0.58)] p-6 backdrop-blur-sm">
            <div className="rounded-3xl border border-cortex-400/35 bg-black/35 px-6 py-5 text-center shadow-[0_0_35px_rgba(248,113,113,0.16)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cortex-100/78">
                GAME OVER
              </p>
              <p className="text-lg font-semibold text-cortex-100">Recall collapsed mid-pattern.</p>
              <p className="mt-2 text-sm text-white/70">
                You held the sequence through length{' '}
                {Math.max(BASE_SEQUENCE_LENGTH, roundLength - 1)}.
              </p>
              <div className="mt-5 flex justify-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl border-white/10 bg-black/25 text-white hover:bg-white/10"
                  onClick={replayGame}
                >
                  Replay
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl border-white/10 bg-black/25 text-white hover:bg-white/10"
                  onClick={onBack}
                >
                  Back
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          className="rounded-2xl border-white/10 bg-black/20 text-white hover:bg-white/10"
          onClick={onBack}
        >
          Back
        </Button>
      </div>

      <div className="text-xs text-white/62">
        Each recovered round extends the firing pattern, asking you to hold a longer sequence in
        working memory.
      </div>
    </div>
  );
}
