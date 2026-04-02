'use client';

/**
 * @noema/web - Session / ResponseControls
 *
 * Post-reveal controls: post-answer confidence capture and 4-point grade buttons.
 */
import { ConfidenceScale } from './pre-answer-confidence';

// ============================================================================
// Types
// ============================================================================

export type Grade = 1 | 2 | 3 | 4;

interface IResponseControlsProps {
  confidenceAfter: number | null;
  onConfidenceAfter: (c: number) => void;
  onGrade: (grade: Grade) => void;
  isSubmitting: boolean;
}

// ============================================================================
// Grade button config
// ============================================================================

interface IGradeConfig {
  label: string;
  shortcut: string;
  border: string;
  bg: string;
  hover: string;
  text: string;
}

const GRADE_CONFIG: Record<Grade, IGradeConfig> = {
  1: {
    label: 'Again',
    shortcut: '1',
    border: 'border-cortex-400/30',
    bg: 'bg-cortex-500/10',
    hover: 'hover:border-cortex-300/50 hover:bg-cortex-500/14',
    text: 'text-cortex-300',
  },
  2: {
    label: 'Hard',
    shortcut: '2',
    border: 'border-amber-400/30',
    bg: 'bg-amber-500/10',
    hover: 'hover:border-amber-300/50 hover:bg-amber-500/14',
    text: 'text-amber-300',
  },
  3: {
    label: 'Good',
    shortcut: '3',
    border: 'border-myelin-400/30',
    bg: 'bg-myelin-500/10',
    hover: 'hover:border-myelin-300/50 hover:bg-myelin-500/14',
    text: 'text-myelin-300',
  },
  4: {
    label: 'Easy',
    shortcut: '4',
    border: 'border-axon-400/30',
    bg: 'bg-axon-500/10',
    hover: 'hover:border-axon-300/50 hover:bg-axon-500/14',
    text: 'text-axon-300',
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
        'flex min-h-[4.75rem] flex-1 flex-col items-center justify-center rounded-xl border px-2 py-2 text-center transition-all sm:min-h-20 sm:rounded-2xl sm:px-3 sm:py-3',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'bg-background/70',
        config.bg,
        config.border,
        config.hover,
      ].join(' ')}
    >
      <span className="text-base font-semibold sm:text-lg">{config.shortcut}</span>
      <span className={['mt-1 text-[11px] font-medium uppercase tracking-[0.2em] sm:text-xs', config.text].join(' ')}>
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
  onGrade,
  isSubmitting,
}: IResponseControlsProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      {/* Post-answer confidence */}
      <ConfidenceScale
        title="Confidence"
        description="Re-rate your confidence now that you have seen the answer."
        value={confidenceAfter}
        onChange={onConfidenceAfter}
      />

      {/* Grade buttons */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
    </div>
  );
}
