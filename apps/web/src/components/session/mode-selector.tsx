'use client';

/**
 * @noema/web - Session / ModeSelector
 *
 * 2×2 grid of philosophical mode cards. Each card maps to a concrete
 * API SessionMode value. The selected card receives a coloured border and
 * tinted background; unselected cards use a neutral hover treatment.
 */

import { BookOpen, Compass, GitMerge, Target } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export type PhilosophicalMode = 'exploration' | 'goal_driven' | 'exam_oriented' | 'synthesis';
export type ApiSessionMode = 'standard' | 'cram' | 'preview' | 'test';

export const MODE_TO_API: Record<PhilosophicalMode, ApiSessionMode> = {
  exploration: 'standard',
  goal_driven: 'cram',
  exam_oriented: 'test',
  synthesis: 'preview',
};

// ============================================================================
// Mode config
// ============================================================================

interface IModeConfig {
  label: string;
  icon: LucideIcon;
  description: string;
  /** Tailwind classes for border when selected */
  selectedBorder: string;
  /** Tailwind classes for background when selected */
  selectedBg: string;
  /** Tailwind classes for icon background when selected */
  selectedIconBg: string;
  /** Tailwind classes for icon and label text when selected */
  selectedText: string;
}

const MODE_CONFIG: Record<PhilosophicalMode, IModeConfig> = {
  exploration: {
    label: 'Exploration',
    icon: Compass,
    description:
      'Wide-ranging review guided by spaced repetition. Best for daily maintenance and building long-term retention.',
    selectedBorder: 'border-blue-500',
    selectedBg: 'bg-blue-500/10',
    selectedIconBg: 'bg-blue-500/10',
    selectedText: 'text-blue-600 dark:text-blue-400',
  },
  goal_driven: {
    label: 'Goal-Driven',
    icon: Target,
    description:
      'High-intensity cramming toward a target. Prioritizes cards closest to forgetting.',
    selectedBorder: 'border-amber-500',
    selectedBg: 'bg-amber-500/10',
    selectedIconBg: 'bg-amber-500/10',
    selectedText: 'text-amber-600 dark:text-amber-400',
  },
  exam_oriented: {
    label: 'Exam-Oriented',
    icon: BookOpen,
    description: 'Timed test simulation with no hints. Measures true recall under pressure.',
    selectedBorder: 'border-red-500',
    selectedBg: 'bg-red-500/10',
    selectedIconBg: 'bg-red-500/10',
    selectedText: 'text-red-600 dark:text-red-400',
  },
  synthesis: {
    label: 'Synthesis',
    icon: GitMerge,
    description:
      'Integrative review linking concepts across topics. Best after learning new material.',
    selectedBorder: 'border-purple-500',
    selectedBg: 'bg-purple-500/10',
    selectedIconBg: 'bg-purple-500/10',
    selectedText: 'text-purple-600 dark:text-purple-400',
  },
};

const ORDERED_MODES: PhilosophicalMode[] = [
  'exploration',
  'goal_driven',
  'exam_oriented',
  'synthesis',
];

// ============================================================================
// ModeCard
// ============================================================================

interface IModeCardProps {
  mode: PhilosophicalMode;
  isSelected: boolean;
  onSelect: (mode: PhilosophicalMode) => void;
}

function ModeCard({ mode, isSelected, onSelect }: IModeCardProps): React.JSX.Element {
  const config = MODE_CONFIG[mode];
  const Icon = config.icon;

  const cardClass = isSelected
    ? `flex flex-col gap-2 rounded-xl p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 border-2 ${config.selectedBorder} ${config.selectedBg}`
    : 'flex flex-col gap-2 rounded-xl p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 border border-border hover:border-muted-foreground/50 hover:bg-muted/30 focus-visible:ring-muted-foreground';

  const iconWrapperClass = isSelected
    ? `flex h-8 w-8 items-center justify-center rounded-lg ${config.selectedIconBg}`
    : 'flex h-8 w-8 items-center justify-center rounded-lg bg-muted';

  const iconClass = isSelected ? `h-4 w-4 ${config.selectedText}` : 'h-4 w-4 text-muted-foreground';

  const labelClass = isSelected
    ? `text-sm font-semibold leading-tight ${config.selectedText}`
    : 'text-sm font-semibold leading-tight text-foreground';

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={() => {
        onSelect(mode);
      }}
      className={cardClass}
    >
      <span className={iconWrapperClass} aria-hidden="true">
        <Icon className={iconClass} />
      </span>

      <span className={labelClass}>{config.label}</span>

      <span className="text-xs leading-snug text-muted-foreground">{config.description}</span>
    </button>
  );
}

// ============================================================================
// ModeSelector
// ============================================================================

interface IModeSelectorProps {
  value: PhilosophicalMode;
  onChange: (mode: PhilosophicalMode) => void;
}

export function ModeSelector({ value, onChange }: IModeSelectorProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-3" role="group" aria-label="Session mode">
      {ORDERED_MODES.map((mode) => (
        <ModeCard key={mode} mode={mode} isSelected={value === mode} onSelect={onChange} />
      ))}
    </div>
  );
}
