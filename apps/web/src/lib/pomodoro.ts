import type { PomodoroSettingsDto, UserSettingsDto } from '@noema/api-client';

export type PomodoroPhase = 'focus' | 'short_break' | 'long_break';

export interface IPomodoroRuntimeState {
  phase: PomodoroPhase;
  isRunning: boolean;
  remainingSeconds: number;
  endsAtMs: number | null;
  completedFocusCycles: number;
  cyclePosition: number;
  updatedAtMs: number;
}

export const POMODORO_RUNTIME_STORAGE_KEY = 'noema-pomodoro-runtime';

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettingsDto = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
  dailyTargetCycles: 6,
  autoStartBreaks: false,
  autoStartFocus: false,
  soundscape: 'none',
  soundscapeVolume: 35,
};

export function resolvePomodoroSettings(
  settings: Pick<UserSettingsDto, 'pomodoro'> | null | undefined
): PomodoroSettingsDto {
  return {
    ...DEFAULT_POMODORO_SETTINGS,
    ...(settings?.pomodoro ?? {}),
  };
}

function isPomodoroPhase(value: string): value is PomodoroPhase {
  return value === 'focus' || value === 'short_break' || value === 'long_break';
}

export function getPhaseLabel(phase: PomodoroPhase): string {
  switch (phase) {
    case 'focus':
      return 'Focus';
    case 'short_break':
      return 'Short break';
    case 'long_break':
      return 'Long break';
  }
}

export function getPhaseDescription(phase: PomodoroPhase): string {
  switch (phase) {
    case 'focus':
      return 'Protect one task, silence switching, and let the countdown hold the boundary.';
    case 'short_break':
      return 'Reset your eyes, stand up, and avoid opening a fresh attention spiral.';
    case 'long_break':
      return 'Step away fully so the next round starts with energy instead of friction.';
  }
}

export function getPhaseDurationSeconds(
  settings: PomodoroSettingsDto,
  phase: PomodoroPhase
): number {
  switch (phase) {
    case 'focus':
      return settings.focusMinutes * 60;
    case 'short_break':
      return settings.shortBreakMinutes * 60;
    case 'long_break':
      return settings.longBreakMinutes * 60;
  }
}

export function createPomodoroRuntime(settings: PomodoroSettingsDto): IPomodoroRuntimeState {
  return {
    phase: 'focus',
    isRunning: false,
    remainingSeconds: getPhaseDurationSeconds(settings, 'focus'),
    endsAtMs: null,
    completedFocusCycles: 0,
    cyclePosition: 0,
    updatedAtMs: Date.now(),
  };
}

export function formatCountdown(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function getCompletionRatio(
  runtime: IPomodoroRuntimeState,
  settings: PomodoroSettingsDto
): number {
  const durationSeconds = getPhaseDurationSeconds(settings, runtime.phase);
  if (durationSeconds <= 0) {
    return 0;
  }

  return Math.min(1, Math.max(0, 1 - runtime.remainingSeconds / durationSeconds));
}

export function advancePomodoroRuntime(
  runtime: IPomodoroRuntimeState,
  settings: PomodoroSettingsDto,
  nowMs = Date.now()
): IPomodoroRuntimeState {
  if (runtime.phase === 'focus') {
    const completedFocusCycles = runtime.completedFocusCycles + 1;
    const nextCyclePosition = runtime.cyclePosition + 1;
    const phase =
      nextCyclePosition >= settings.cyclesBeforeLongBreak ? 'long_break' : 'short_break';
    const cyclePosition = phase === 'long_break' ? 0 : nextCyclePosition;
    const remainingSeconds = getPhaseDurationSeconds(settings, phase);
    const isRunning = settings.autoStartBreaks;

    return {
      phase,
      isRunning,
      remainingSeconds,
      endsAtMs: isRunning ? nowMs + remainingSeconds * 1000 : null,
      completedFocusCycles,
      cyclePosition,
      updatedAtMs: nowMs,
    };
  }

  const remainingSeconds = getPhaseDurationSeconds(settings, 'focus');
  const isRunning = settings.autoStartFocus;

  return {
    ...runtime,
    phase: 'focus',
    isRunning,
    remainingSeconds,
    endsAtMs: isRunning ? nowMs + remainingSeconds * 1000 : null,
    updatedAtMs: nowMs,
  };
}

export function reconcilePomodoroRuntime(
  runtime: IPomodoroRuntimeState,
  settings: PomodoroSettingsDto,
  nowMs = Date.now()
): IPomodoroRuntimeState {
  let nextRuntime = { ...runtime };
  let guard = 0;

  while (
    nextRuntime.isRunning &&
    nextRuntime.endsAtMs !== null &&
    nextRuntime.endsAtMs <= nowMs &&
    guard < 8
  ) {
    nextRuntime = advancePomodoroRuntime(nextRuntime, settings, nextRuntime.endsAtMs);
    guard += 1;
  }

  if (nextRuntime.isRunning && nextRuntime.endsAtMs !== null) {
    return {
      ...nextRuntime,
      remainingSeconds: Math.max(0, Math.ceil((nextRuntime.endsAtMs - nowMs) / 1000)),
      updatedAtMs: nowMs,
    };
  }

  return nextRuntime;
}

export function readStoredPomodoroRuntime(): IPomodoroRuntimeState | undefined {
  if (typeof globalThis.localStorage === 'undefined') {
    return undefined;
  }

  const value = globalThis.localStorage.getItem(POMODORO_RUNTIME_STORAGE_KEY);
  if (value === null) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as Partial<IPomodoroRuntimeState>;
    if (
      typeof parsed.phase !== 'string' ||
      typeof parsed.isRunning !== 'boolean' ||
      typeof parsed.remainingSeconds !== 'number' ||
      typeof parsed.completedFocusCycles !== 'number' ||
      typeof parsed.cyclePosition !== 'number'
    ) {
      return undefined;
    }

    if (!isPomodoroPhase(parsed.phase)) {
      return undefined;
    }

    return {
      phase: parsed.phase,
      isRunning: parsed.isRunning,
      remainingSeconds: parsed.remainingSeconds,
      endsAtMs: typeof parsed.endsAtMs === 'number' ? parsed.endsAtMs : null,
      completedFocusCycles: parsed.completedFocusCycles,
      cyclePosition: parsed.cyclePosition,
      updatedAtMs: typeof parsed.updatedAtMs === 'number' ? parsed.updatedAtMs : Date.now(),
    };
  } catch {
    return undefined;
  }
}

export function persistPomodoroRuntime(runtime: IPomodoroRuntimeState): void {
  if (typeof globalThis.localStorage === 'undefined') {
    return;
  }

  globalThis.localStorage.setItem(POMODORO_RUNTIME_STORAGE_KEY, JSON.stringify(runtime));
}
