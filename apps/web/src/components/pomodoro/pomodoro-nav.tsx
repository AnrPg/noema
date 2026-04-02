'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useMySettings, useUpdateSettings, type PomodoroSettingsDto } from '@noema/api-client';
import { useAuthStore } from '@noema/auth';
import { Button, cn } from '@noema/ui';
import {
  Brain,
  CloudRain,
  Coffee,
  Loader2,
  MoonStar,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import * as React from 'react';
import { usePomodoroSoundscape } from '@/hooks/use-pomodoro-soundscape';
import { toast } from '@/hooks/use-toast';
import {
  advancePomodoroRuntime,
  createPomodoroRuntime,
  formatCountdown,
  getPhaseDescription,
  getPhaseLabel,
  getPhaseDurationSeconds,
  persistPomodoroRuntime,
  readStoredPomodoroRuntime,
  reconcilePomodoroRuntime,
  resolvePomodoroSettings,
  type IPomodoroRuntimeState,
  type PomodoroPhase,
} from '@/lib/pomodoro';

const PRESETS: {
  id: string;
  name: string;
  subtitle: string;
  values: PomodoroSettingsDto;
}[] = [
  {
    id: 'classic',
    name: 'Classic 25',
    subtitle: 'Balanced, steady, familiar',
    values: {
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      cyclesBeforeLongBreak: 4,
      dailyTargetCycles: 6,
      autoStartBreaks: false,
      autoStartFocus: false,
      soundscape: 'none',
      soundscapeVolume: 35,
    },
  },
  {
    id: 'sprint',
    name: 'Sprint 20',
    subtitle: 'Fast momentum for hard starts',
    values: {
      focusMinutes: 20,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      cyclesBeforeLongBreak: 4,
      dailyTargetCycles: 8,
      autoStartBreaks: true,
      autoStartFocus: false,
      soundscape: 'cafe',
      soundscapeVolume: 30,
    },
  },
  {
    id: 'deep-work',
    name: 'Deep Work 50',
    subtitle: 'Longer dives, fewer resets',
    values: {
      focusMinutes: 50,
      shortBreakMinutes: 10,
      longBreakMinutes: 20,
      cyclesBeforeLongBreak: 3,
      dailyTargetCycles: 4,
      autoStartBreaks: false,
      autoStartFocus: false,
      soundscape: 'deep_focus',
      soundscapeVolume: 42,
    },
  },
];

const SOUNDSCAPE_OPTIONS: {
  id: PomodoroSettingsDto['soundscape'];
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string | undefined }>;
}[] = [
  {
    id: 'none',
    label: 'Quiet',
    description: 'Timer only, no ambience.',
    icon: VolumeX,
  },
  {
    id: 'rain',
    label: 'Rain',
    description: 'Soft band-passed noise for gentle isolation.',
    icon: CloudRain,
  },
  {
    id: 'cafe',
    label: 'Cafe',
    description: 'Room tone with a low hum to mask silence.',
    icon: Coffee,
  },
  {
    id: 'deep_focus',
    label: 'Deep Focus',
    description: 'Warm tonal bed for longer concentration blocks.',
    icon: Brain,
  },
  {
    id: 'night_owls',
    label: 'Night Owls',
    description: 'Darker low-end ambience for late study windows.',
    icon: MoonStar,
  },
];

function updateNumberField(
  previous: PomodoroSettingsDto,
  key:
    | 'focusMinutes'
    | 'shortBreakMinutes'
    | 'longBreakMinutes'
    | 'cyclesBeforeLongBreak'
    | 'dailyTargetCycles'
    | 'soundscapeVolume',
  value: number
): PomodoroSettingsDto {
  return {
    ...previous,
    [key]: value,
  };
}

function pauseRuntime(runtime: IPomodoroRuntimeState, nowMs = Date.now()): IPomodoroRuntimeState {
  if (!runtime.isRunning || runtime.endsAtMs === null) {
    return runtime;
  }

  return {
    ...runtime,
    isRunning: false,
    remainingSeconds: Math.max(0, Math.ceil((runtime.endsAtMs - nowMs) / 1000)),
    endsAtMs: null,
    updatedAtMs: nowMs,
  };
}

function startRuntime(runtime: IPomodoroRuntimeState, nowMs = Date.now()): IPomodoroRuntimeState {
  return {
    ...runtime,
    isRunning: true,
    endsAtMs: nowMs + runtime.remainingSeconds * 1000,
    updatedAtMs: nowMs,
  };
}

function isAutoStartEnabled(settings: PomodoroSettingsDto, nextPhase: PomodoroPhase): boolean {
  return nextPhase === 'focus' ? settings.autoStartFocus : settings.autoStartBreaks;
}

function MetricCard(props: {
  label: string;
  value: string;
  description: string;
}): React.JSX.Element {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-axon-100/72 dark:text-axon-100/72">
        {props.label}
      </p>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">
        {props.value}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{props.description}</p>
    </div>
  );
}

function RangeField(props: {
  label: string;
  helper: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
}): React.JSX.Element {
  return (
    <div className="rounded-[28px] border border-white/10 bg-black/10 p-4 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-foreground">{props.label}</p>
          <p className="mt-1 text-sm text-muted-foreground">{props.helper}</p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 font-mono text-sm tabular-nums text-foreground">
          {String(props.value)} {props.unit}
        </div>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        value={props.value}
        className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-primary"
        onChange={(event) => {
          props.onChange(Number(event.target.value));
        }}
      />
      <div className="mt-2 flex justify-between text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        <span>{String(props.min)}</span>
        <span>{String(props.max)}</span>
      </div>
    </div>
  );
}

function ToggleCard(props: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between rounded-[28px] border border-white/10 bg-black/10 p-4 backdrop-blur-sm">
      <div className="pr-4">
        <p className="text-sm font-semibold text-foreground">{props.label}</p>
        <p className="mt-1 text-sm text-muted-foreground">{props.description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        className={cn(
          'relative inline-flex h-7 w-12 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          props.checked ? 'border-synapse-300/70 bg-synapse-400/85' : 'border-white/10 bg-white/10'
        )}
        onClick={() => {
          props.onChange(!props.checked);
        }}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform',
            props.checked ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
    </div>
  );
}

interface IPomodoroNavProps {
  compact?: boolean;
}

export function PomodoroNav({ compact = false }: IPomodoroNavProps): React.JSX.Element {
  const authSettings = useAuthStore((state) => state.settings);
  const setAuthSettings = useAuthStore((state) => state.setSettings);
  const settingsQuery = useMySettings();
  const updateSettings = useUpdateSettings();
  const effectiveSettings = settingsQuery.data ?? authSettings;
  const pomodoroSettings = React.useMemo(
    () => resolvePomodoroSettings(effectiveSettings),
    [effectiveSettings]
  );
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [draftSettings, setDraftSettings] = React.useState<PomodoroSettingsDto>(pomodoroSettings);
  const [nowMs, setNowMs] = React.useState(Date.now());
  const [previewingSoundscape, setPreviewingSoundscape] = React.useState<
    PomodoroSettingsDto['soundscape'] | null
  >(null);
  const previewResetTimeoutRef = React.useRef<number | null>(null);
  const [runtime, setRuntime] = React.useState<IPomodoroRuntimeState>(() => {
    const storedRuntime = readStoredPomodoroRuntime();
    return storedRuntime !== undefined
      ? reconcilePomodoroRuntime(storedRuntime, pomodoroSettings)
      : createPomodoroRuntime(pomodoroSettings);
  });
  const { unlockAudio, playPreview } = usePomodoroSoundscape({
    enabled: runtime.isRunning,
    soundscape: pomodoroSettings.soundscape,
    volume: pomodoroSettings.soundscapeVolume,
  });

  React.useEffect(() => {
    setRuntime((current) => {
      const reconciled = reconcilePomodoroRuntime(current, pomodoroSettings);
      if (
        !current.isRunning &&
        current.completedFocusCycles === 0 &&
        current.phase === 'focus' &&
        current.endsAtMs === null
      ) {
        return createPomodoroRuntime(pomodoroSettings);
      }

      return reconciled;
    });

    if (!isDialogOpen) {
      setDraftSettings(pomodoroSettings);
    }
  }, [isDialogOpen, pomodoroSettings]);

  React.useEffect(() => {
    persistPomodoroRuntime(runtime);
  }, [runtime]);

  React.useEffect(() => {
    return () => {
      if (previewResetTimeoutRef.current !== null) {
        window.clearTimeout(previewResetTimeoutRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (!runtime.isRunning) {
      return;
    }

    const timer = window.setInterval(() => {
      const currentNow = Date.now();
      setNowMs(currentNow);
      setRuntime((current) => {
        const reconciled = reconcilePomodoroRuntime(current, pomodoroSettings, currentNow);
        if (
          reconciled.phase !== current.phase ||
          reconciled.completedFocusCycles !== current.completedFocusCycles
        ) {
          toast.success(`${getPhaseLabel(reconciled.phase)} block is ready.`);
        }
        return reconciled;
      });
    }, 250);

    return () => {
      window.clearInterval(timer);
    };
  }, [pomodoroSettings, runtime.isRunning]);

  const remainingSeconds =
    runtime.isRunning && runtime.endsAtMs !== null
      ? Math.max(0, Math.ceil((runtime.endsAtMs - nowMs) / 1000))
      : runtime.remainingSeconds;

  const displayRuntime = React.useMemo(
    () => ({ ...runtime, remainingSeconds }),
    [remainingSeconds, runtime]
  );
  const nextPhasePreview = React.useMemo(() => {
    const upcoming = advancePomodoroRuntime(
      pauseRuntime(displayRuntime),
      pomodoroSettings,
      Date.now()
    );
    return `${getPhaseLabel(upcoming.phase)}${
      isAutoStartEnabled(pomodoroSettings, upcoming.phase)
        ? ' will auto-start'
        : ' will wait for you'
    }`;
  }, [displayRuntime, pomodoroSettings]);

  const dailyFocusMinutes = pomodoroSettings.dailyTargetCycles * pomodoroSettings.focusMinutes;
  const totalLongBreaks = Math.floor(
    pomodoroSettings.dailyTargetCycles / pomodoroSettings.cyclesBeforeLongBreak
  );
  const totalShortBreaks = Math.max(0, pomodoroSettings.dailyTargetCycles - 1 - totalLongBreaks);
  const dailyRecoveryMinutes =
    totalShortBreaks * pomodoroSettings.shortBreakMinutes +
    totalLongBreaks * pomodoroSettings.longBreakMinutes;
  const completedTodayLabel = `${String(displayRuntime.completedFocusCycles)}/${String(
    pomodoroSettings.dailyTargetCycles
  )}`;
  const currentSoundscapeMeta = SOUNDSCAPE_OPTIONS.find(
    (option) => option.id === pomodoroSettings.soundscape
  );

  const handleToggleRun = async (): Promise<void> => {
    const currentNow = Date.now();
    setNowMs(currentNow);

    if (runtime.isRunning) {
      setRuntime((current) => pauseRuntime(current, currentNow));
      return;
    }

    await unlockAudio();
    setRuntime((current) => startRuntime(current, currentNow));
  };

  const handleReset = (): void => {
    const currentNow = Date.now();
    setNowMs(currentNow);
    setRuntime(createPomodoroRuntime(pomodoroSettings));
  };

  const handleSave = async (): Promise<void> => {
    if (effectiveSettings === null) {
      toast.error('Pomodoro settings are still loading. Try again in a moment.');
      return;
    }

    try {
      const response = await updateSettings.mutateAsync({
        data: {
          pomodoro: draftSettings,
        },
        version: effectiveSettings.version,
      });

      setAuthSettings(response.data);
      setIsDialogOpen(false);
      setRuntime(createPomodoroRuntime(resolvePomodoroSettings(response.data)));
      toast.success('Pomodoro rhythm saved. Timer reset to the next focus block.');
    } catch {
      toast.error('Could not save pomodoro settings.');
    }
  };

  const handlePreview = async (
    nextSoundscape: PomodoroSettingsDto['soundscape'],
    nextVolume: number
  ): Promise<void> => {
    await playPreview(nextSoundscape, nextVolume);
    setPreviewingSoundscape(nextSoundscape === 'none' ? null : nextSoundscape);

    if (previewResetTimeoutRef.current !== null) {
      window.clearTimeout(previewResetTimeoutRef.current);
    }

    previewResetTimeoutRef.current = window.setTimeout(() => {
      setPreviewingSoundscape(null);
      previewResetTimeoutRef.current = null;
    }, 2800);
  };

  return (
    <Dialog.Root open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <div
        className={cn(
          'flex min-w-0 items-center gap-2',
          compact && 'min-w-0 flex-1 justify-start gap-1 sm:gap-1.5'
        )}
      >
        <div
          aria-live="polite"
          className={cn(
            'relative flex min-w-0 items-center overflow-hidden rounded-full border border-border/60 bg-background/80 shadow-sm transition-all duration-300',
            compact
              ? 'h-9 max-w-[min(7.5rem,30vw)] px-2 sm:h-10 sm:max-w-[min(9rem,28vw)] sm:px-3 md:h-11 md:max-w-[min(11rem,30vw)] md:px-4'
              : 'max-w-[min(14rem,36vw)] px-4',
            runtime.isRunning &&
              'border-synapse-300/60 shadow-[0_0_0_1px_hsl(var(--synapse-400)/0.12),0_10px_28px_hsl(var(--synapse-400)/0.16)]'
          )}
        >
          <div
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-y-1 left-2 w-16 rounded-full bg-transparent blur-2xl transition-opacity duration-300',
              runtime.isRunning && 'bg-synapse-400/20 opacity-100 motion-safe:animate-pulse',
              !runtime.isRunning && 'opacity-0'
            )}
          />

          <div className="relative flex min-w-0 flex-1 items-center gap-3">
            <span
              className={cn(
                'shrink-0 rounded-full bg-muted-foreground/35 transition-all duration-300',
                compact ? 'hidden md:block md:h-2.5 md:w-2.5' : 'h-2.5 w-2.5',
                runtime.isRunning &&
                  'bg-synapse-400 shadow-[0_0_0_6px_hsl(var(--synapse-400)/0.12)] motion-safe:animate-pulse'
              )}
            />

            <span
              className={cn(
                'font-mono font-semibold tracking-tight tabular-nums text-foreground',
                compact ? 'text-sm sm:text-base md:text-xl' : 'text-xl sm:text-2xl'
              )}
            >
              {formatCountdown(remainingSeconds)}
            </span>

            <span
              className={cn(
                'truncate text-sm text-muted-foreground',
                compact ? 'hidden xl:inline' : 'hidden md:inline'
              )}
            >
              {getPhaseLabel(runtime.phase)}
            </span>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={runtime.isRunning ? 'Pause pomodoro' : 'Start pomodoro'}
          className={cn(
            'rounded-full border border-border/60 bg-background/80 transition-all duration-200 hover:scale-[1.04] hover:bg-accent active:scale-95',
            compact ? 'h-9 w-9 sm:h-10 sm:w-10 md:h-11 md:w-11' : 'h-11 w-11',
            runtime.isRunning && 'border-synapse-300/60 bg-synapse-400/10 text-synapse-500'
          )}
          onClick={() => {
            void handleToggleRun();
          }}
        >
          {runtime.isRunning ? (
            <Pause className={cn(compact ? 'h-4 w-4 sm:h-5 sm:w-5' : 'h-5 w-5')} />
          ) : (
            <Play className={cn(compact ? 'h-4 w-4 sm:h-5 sm:w-5' : 'h-5 w-5')} />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Reset pomodoro"
          className={cn(
            'rounded-full border border-border/60 bg-background/80 transition-all duration-200 hover:scale-[1.04] hover:bg-accent active:scale-95',
            compact ? 'hidden md:inline-flex md:h-11 md:w-11' : 'h-11 w-11'
          )}
          onClick={handleReset}
        >
          <RotateCcw className={cn(compact ? 'h-4 w-4 sm:h-5 sm:w-5' : 'h-5 w-5')} />
        </Button>
        <Dialog.Trigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Configure pomodoro"
            className={cn(
              'rounded-full border border-border/60 bg-background/80 transition-all duration-200 hover:scale-[1.04] hover:bg-accent active:scale-95',
              compact ? 'hidden lg:inline-flex lg:h-11 lg:w-11' : 'h-11 w-11'
            )}
          >
            <Settings2 className={cn(compact ? 'h-4 w-4 sm:h-5 sm:w-5' : 'h-5 w-5')} />
          </Button>
        </Dialog.Trigger>
      </div>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgba(5,10,20,0.64)] backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-4 top-[6vh] z-50 mx-auto max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,hsl(var(--synapse-900)/0.92),hsl(var(--background)/0.97)_42%,hsl(var(--dendrite-900)/0.82)_100%)] text-foreground shadow-[0_40px_140px_rgba(0,0,0,0.45)]">
          <div className="relative flex max-h-[88vh] flex-col overflow-hidden">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-6">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-axon-100/75">
                  <Sparkles className="h-3.5 w-3.5" />
                  Focus Rhythm Designer
                </div>
                <Dialog.Title className="mt-4 text-3xl font-semibold tracking-tight text-white">
                  Shape a pomodoro rhythm that feels deliberate.
                </Dialog.Title>
                <Dialog.Description className="mt-3 max-w-xl text-sm leading-7 text-axon-100/78">
                  Tune the cadence, keep the sections top-to-bottom, and click any soundscape to
                  hear a live preview before saving.
                </Dialog.Description>
              </div>

              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close pomodoro settings"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            <div className="overflow-y-auto px-6 py-6">
              <div className="space-y-6">
                <section className="rounded-[32px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-white">Quick rhythms</p>
                      <p className="mt-1 text-sm text-axon-100/76">
                        Start from a preset, then fine-tune the details below.
                      </p>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-axon-100/76">
                      Current: {currentSoundscapeMeta?.label ?? 'Quiet'}
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className="w-full rounded-[24px] border border-white/10 bg-black/10 p-4 text-left transition hover:border-synapse-300/50 hover:bg-white/10"
                        onClick={() => {
                          setDraftSettings(preset.values);
                        }}
                      >
                        <p className="text-sm font-semibold text-white">{preset.name}</p>
                        <p className="mt-2 text-xs uppercase tracking-[0.22em] text-axon-100/65">
                          {preset.values.focusMinutes}/{preset.values.shortBreakMinutes}/
                          {preset.values.longBreakMinutes}
                        </p>
                        <p className="mt-2 text-sm text-axon-100/76">{preset.subtitle}</p>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="rounded-[32px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                  <p className="text-sm font-semibold text-white">Timer structure</p>
                  <div className="mt-4 space-y-4">
                    <RangeField
                      label="Focus block"
                      helper="Long enough to enter the work, short enough to protect urgency."
                      value={draftSettings.focusMinutes}
                      min={10}
                      max={90}
                      unit="min"
                      onChange={(value) => {
                        setDraftSettings((current) =>
                          updateNumberField(current, 'focusMinutes', value)
                        );
                      }}
                    />
                    <RangeField
                      label="Short break"
                      helper="Reset attention without giving your brain time to wander."
                      value={draftSettings.shortBreakMinutes}
                      min={3}
                      max={30}
                      unit="min"
                      onChange={(value) => {
                        setDraftSettings((current) =>
                          updateNumberField(current, 'shortBreakMinutes', value)
                        );
                      }}
                    />
                    <RangeField
                      label="Long break"
                      helper="The full reset that keeps later cycles from collapsing."
                      value={draftSettings.longBreakMinutes}
                      min={10}
                      max={60}
                      unit="min"
                      onChange={(value) => {
                        setDraftSettings((current) =>
                          updateNumberField(current, 'longBreakMinutes', value)
                        );
                      }}
                    />
                    <RangeField
                      label="Cycles before long break"
                      helper="Use more cycles for flow, fewer if you fatigue quickly."
                      value={draftSettings.cyclesBeforeLongBreak}
                      min={2}
                      max={6}
                      unit="cycles"
                      onChange={(value) => {
                        setDraftSettings((current) =>
                          updateNumberField(current, 'cyclesBeforeLongBreak', value)
                        );
                      }}
                    />
                  </div>
                </section>

                <section className="rounded-[32px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                  <p className="text-sm font-semibold text-white">Automation and target</p>
                  <div className="mt-4 space-y-4">
                    <ToggleCard
                      label="Auto-start breaks"
                      description="Useful when you want focus to end crisply without needing another click."
                      checked={draftSettings.autoStartBreaks}
                      onChange={(checked) => {
                        setDraftSettings((current) => ({
                          ...current,
                          autoStartBreaks: checked,
                        }));
                      }}
                    />
                    <ToggleCard
                      label="Auto-start focus"
                      description="Keeps momentum high, but only use it if your breaks stay intentional."
                      checked={draftSettings.autoStartFocus}
                      onChange={(checked) => {
                        setDraftSettings((current) => ({
                          ...current,
                          autoStartFocus: checked,
                        }));
                      }}
                    />
                    <RangeField
                      label="Daily target"
                      helper="A realistic target beats an aspirational one you learn to ignore."
                      value={draftSettings.dailyTargetCycles}
                      min={1}
                      max={12}
                      unit="cycles"
                      onChange={(value) => {
                        setDraftSettings((current) =>
                          updateNumberField(current, 'dailyTargetCycles', value)
                        );
                      }}
                    />
                  </div>
                </section>

                <section className="rounded-[32px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                  <p className="text-sm font-semibold text-white">Daily projection</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <MetricCard
                      label="Daily Focus"
                      value={`${String(dailyFocusMinutes)}m`}
                      description="Total protected time if you hit the target without drifting."
                    />
                    <MetricCard
                      label="Recovery"
                      value={`${String(dailyRecoveryMinutes)}m`}
                      description="Break time to keep energy from flattening across the day."
                    />
                    <MetricCard
                      label="Completed"
                      value={completedTodayLabel}
                      description="Header timer progress based on completed focus cycles this session."
                    />
                    <MetricCard
                      label="Next Transition"
                      value={getPhaseLabel(
                        advancePomodoroRuntime(pauseRuntime(displayRuntime), pomodoroSettings).phase
                      )}
                      description={nextPhasePreview}
                    />
                  </div>
                </section>

                <section className="rounded-[32px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                  <div className="flex items-center gap-2">
                    <Volume2 className="h-4 w-4 text-myelin-200" />
                    <p className="text-sm font-semibold text-white">Background soundscape</p>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-axon-100/76">
                    Click any soundscape to hear how it would sound before you save it.
                  </p>
                  <div className="mt-4 space-y-3">
                    {SOUNDSCAPE_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={cn(
                          'flex w-full items-start gap-3 rounded-[24px] border p-4 text-left transition',
                          draftSettings.soundscape === option.id
                            ? 'border-myelin-300/70 bg-myelin-400/10 shadow-[0_16px_36px_hsl(var(--myelin-400)/0.14)]'
                            : 'border-white/10 bg-black/10 hover:border-white/20 hover:bg-white/10'
                        )}
                        onClick={() => {
                          setDraftSettings((current) => ({
                            ...current,
                            soundscape: option.id,
                          }));
                          void handlePreview(option.id, draftSettings.soundscapeVolume);
                        }}
                      >
                        <div className="mt-0.5 rounded-2xl border border-white/10 bg-white/10 p-2">
                          <option.icon className="h-4 w-4 text-white" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-white">{option.label}</p>
                            {previewingSoundscape === option.id && (
                              <span className="rounded-full border border-myelin-300/40 bg-myelin-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-myelin-100">
                                Previewing
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm leading-relaxed text-axon-100/76">
                            {option.description}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="mt-4">
                    <RangeField
                      label="Soundscape volume"
                      helper="Keep it low enough to soften the room without hijacking attention."
                      value={draftSettings.soundscapeVolume}
                      min={0}
                      max={100}
                      unit="%"
                      onChange={(value) => {
                        setDraftSettings((current) =>
                          updateNumberField(current, 'soundscapeVolume', value)
                        );
                      }}
                    />
                  </div>
                </section>

                <section className="rounded-[32px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                  <p className="text-sm font-semibold text-white">How to use the rhythm well</p>
                  <div className="mt-4 space-y-3">
                    {(['focus', 'short_break', 'long_break'] as PomodoroPhase[]).map((phase) => (
                      <div
                        key={phase}
                        className="rounded-[24px] border border-white/10 bg-black/10 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-white">{getPhaseLabel(phase)}</p>
                          <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-mono uppercase tracking-[0.18em] text-axon-100/72">
                            {String(getPhaseDurationSeconds(draftSettings, phase) / 60)} min
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-axon-100/78">
                          {getPhaseDescription(phase)}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-black/20 px-6 py-4">
              <div className="text-sm text-axon-100/76">
                Saving applies the new cadence and resets the header timer to a fresh focus block.
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="border border-white/10 bg-white/5 text-white hover:bg-white/10"
                  onClick={() => {
                    setDraftSettings(pomodoroSettings);
                    setRuntime(createPomodoroRuntime(pomodoroSettings));
                  }}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset timer now
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    void handleSave();
                  }}
                  disabled={updateSettings.isPending}
                  className="min-w-[11rem] rounded-full bg-[linear-gradient(135deg,hsl(var(--synapse-400)),hsl(var(--dendrite-400)))] text-white shadow-[0_18px_38px_hsl(var(--synapse-400)/0.24)]"
                >
                  {updateSettings.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  Save rhythm
                </Button>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
