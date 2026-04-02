'use client';

/**
 * @noema/web - Session / PreAnswerConfidence
 *
 * Pre-answer confidence capture shown before the user reveals the answer.
 */

const CONFIDENCE_STOPS = [
  { value: 0, label: 'Very unsure', mobileLabel: 'Low', shortLabel: '1' },
  { value: 0.25, label: 'Unsure', mobileLabel: 'Low+', shortLabel: '2' },
  { value: 0.5, label: 'Balanced', mobileLabel: 'Mid', shortLabel: '3' },
  { value: 0.75, label: 'Sure', mobileLabel: 'High-', shortLabel: '4' },
  { value: 1, label: 'Very sure', mobileLabel: 'High', shortLabel: '5' },
] as const;

// ============================================================================
// Types
// ============================================================================

interface IPreAnswerConfidenceProps {
  value: number | null;
  onChange: (confidence: number) => void;
}

interface IConfidenceScaleProps {
  title: string;
  description: string;
  instruction?: string;
  value: number | null;
  onChange: (confidence: number) => void;
}

export function ConfidenceScale({
  title,
  description,
  instruction,
  value,
  onChange,
}: IConfidenceScaleProps): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            {title}
          </p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        {instruction !== undefined && (
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/8 px-3 py-2.5 text-sm leading-6 text-cyan-50/88">
            {instruction}
          </div>
        )}

        <div className="grid grid-cols-5 gap-1.5 sm:gap-2" role="radiogroup" aria-label={title}>
          {CONFIDENCE_STOPS.map((stop) => {
            const selected = (value ?? 0.5) === stop.value;
            return (
              <button
                key={stop.value}
                type="button"
                role="radio"
                aria-checked={selected}
                className={[
                  'flex min-h-[4.75rem] flex-col items-center justify-center rounded-xl border px-1 py-2 text-center transition-all sm:min-h-20 sm:rounded-2xl sm:px-2 sm:py-3',
                  selected
                    ? 'border-cyan-400/60 bg-cyan-400/12 text-foreground shadow-[0_10px_30px_rgba(34,211,238,0.14)]'
                    : 'border-border/60 bg-background/70 text-muted-foreground hover:border-cyan-400/30 hover:text-foreground',
                ].join(' ')}
                onClick={() => {
                  onChange(stop.value);
                }}
              >
                <span className="text-base font-semibold sm:text-lg">{stop.shortLabel}</span>
                <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] sm:hidden">
                  {stop.mobileLabel}
                </span>
                <span className="mt-1 hidden text-[11px] uppercase tracking-[0.2em] sm:block">
                  {stop.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PreAnswerConfidence
// ============================================================================

export function PreAnswerConfidence({
  value,
  onChange,
}: IPreAnswerConfidenceProps): React.JSX.Element {
  return (
    <ConfidenceScale
      title="Confidence"
      description="Pick where you are on the scale before revealing the rest."
      instruction="Choosing a confidence point also reveals the answer. Use it as your commit moment: notice how certain you feel, then compare that feeling with what is actually true."
      value={value}
      onChange={onChange}
    />
  );
}
