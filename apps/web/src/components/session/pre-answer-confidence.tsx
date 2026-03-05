'use client';

/**
 * @noema/web - Session / PreAnswerConfidence
 *
 * Pre-answer confidence capture shown before the user reveals the answer.
 * Wraps the @noema/ui ConfidenceMeter in interactive mode.
 */

import { ConfidenceMeter } from '@noema/ui';

// ============================================================================
// Types
// ============================================================================

interface IPreAnswerConfidenceProps {
  value: number | null;
  onChange: (confidence: number) => void;
}

// ============================================================================
// PreAnswerConfidence
// ============================================================================

export function PreAnswerConfidence({
  value,
  onChange,
}: IPreAnswerConfidenceProps): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-2 py-3">
      <p className="text-sm text-muted-foreground">How confident are you?</p>
      <ConfidenceMeter
        value={value ?? 0.5}
        onChange={onChange}
        showLabel
        className="w-full max-w-xs"
        aria-label="Pre-answer confidence"
      />
    </div>
  );
}
