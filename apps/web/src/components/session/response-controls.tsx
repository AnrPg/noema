'use client';

/**
 * @noema/web - Session / ResponseControls
 *
 * Post-reveal controls: post-answer confidence capture, 4-point grade buttons,
 * hint request button, and self-reported-guess checkbox.
 */

import { HelpCircle } from 'lucide-react';
import { ConfidenceMeter } from '@noema/ui';

// ============================================================================
// Types
// ============================================================================

export type Grade = 1 | 2 | 3 | 4;

interface IResponseControlsProps {
  confidenceAfter: number | null;
  onConfidenceAfter: (c: number) => void;
  hintDepth: number;
  maxHints: number;
  onHint: () => void;
  selfReportedGuess: boolean;
  onSelfReportedGuess: (v: boolean) => void;
  onGrade: (grade: Grade) => void;
  isSubmitting: boolean;
}

// ============================================================================
// Grade button config
// ============================================================================

interface IGradeConfig {
  label: string;
  shortcut: string;
  /** Button background (idle) */
  bg: string;
  /** Button background (hover) */
  bgHover: string;
  /** Text color */
  text: string;
  /** Border color */
  border: string;
}

const GRADE_CONFIG: Record<Grade, IGradeConfig> = {
  1: {
    label: 'Again',
    shortcut: '1',
    bg: 'bg-cortex-50 dark:bg-cortex-950',
    bgHover: 'hover:bg-cortex-100 dark:hover:bg-cortex-900',
    text: 'text-cortex-700 dark:text-cortex-300',
    border: 'border-cortex-300 dark:border-cortex-700',
  },
  2: {
    label: 'Hard',
    shortcut: '2',
    bg: 'bg-amber-50 dark:bg-amber-950',
    bgHover: 'hover:bg-amber-100 dark:hover:bg-amber-900',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-300 dark:border-amber-700',
  },
  3: {
    label: 'Good',
    shortcut: '3',
    bg: 'bg-myelin-50 dark:bg-myelin-950',
    bgHover: 'hover:bg-myelin-100 dark:hover:bg-myelin-900',
    text: 'text-myelin-700 dark:text-myelin-300',
    border: 'border-myelin-300 dark:border-myelin-700',
  },
  4: {
    label: 'Easy',
    shortcut: '4',
    bg: 'bg-axon-50 dark:bg-axon-950',
    bgHover: 'hover:bg-axon-100 dark:hover:bg-axon-900',
    text: 'text-axon-700 dark:text-axon-300',
    border: 'border-axon-300 dark:border-axon-700',
  },
};

const GRADES: Grade[] = [1, 2, 3, 4];

// ============================================================================
// GradeButton
// ============================================================================

interface IGradeButtonProps {
  grade: Grade;
  onClick: () => void;
  disabled: boolean;
}

function GradeButton({ grade, onClick, disabled }: IGradeButtonProps): React.JSX.Element {
  const config = GRADE_CONFIG[grade];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Grade ${config.label} (${config.shortcut})`}
      className={[
        'flex flex-1 flex-col items-center gap-0.5 rounded-lg border px-2 py-2.5 text-center transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        config.bg,
        config.bgHover,
        config.border,
      ].join(' ')}
    >
      <span className="text-xs font-mono text-muted-foreground">{config.shortcut}</span>
      <span className={['text-sm font-semibold leading-tight', config.text].join(' ')}>
        {config.label}
      </span>
    </button>
  );
}

// ============================================================================
// ResponseControls
// ============================================================================

export function ResponseControls({
  confidenceAfter,
  onConfidenceAfter,
  hintDepth,
  maxHints,
  onHint,
  selfReportedGuess,
  onSelfReportedGuess,
  onGrade,
  isSubmitting,
}: IResponseControlsProps): React.JSX.Element {
  const hintExhausted = hintDepth >= maxHints;

  return (
    <div className="flex flex-col gap-4">
      {/* Post-answer confidence */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm text-muted-foreground">How confident are you now?</p>
        <ConfidenceMeter
          value={confidenceAfter ?? 0.5}
          onChange={onConfidenceAfter}
          showLabel
          className="w-full max-w-xs"
          aria-label="Post-answer confidence"
        />
      </div>

      {/* Grade buttons */}
      <div className="flex gap-2">
        {GRADES.map((grade) => (
          <GradeButton
            key={grade}
            grade={grade}
            onClick={() => {
              onGrade(grade);
            }}
            disabled={isSubmitting}
          />
        ))}
      </div>

      {/* Hint + self-report row */}
      <div className="flex items-center justify-between gap-2">
        {/* Hint button */}
        <button
          type="button"
          onClick={onHint}
          disabled={hintExhausted}
          aria-label={`Request hint (${String(hintDepth)} of ${String(maxHints)} used)`}
          className={[
            'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'border-border hover:bg-muted/50',
          ].join(' ')}
        >
          <HelpCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span>
            Hint {String(hintDepth)}/{String(maxHints)}
          </span>
        </button>

        {/* Self-report toggle */}
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={selfReportedGuess}
            onChange={(e) => {
              onSelfReportedGuess(e.target.checked);
            }}
            className="h-4 w-4 rounded border-border accent-axon-500 focus-visible:ring-2 focus-visible:ring-offset-2"
          />
          I guessed
        </label>
      </div>
    </div>
  );
}
