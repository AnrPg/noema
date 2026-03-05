'use client';

/**
 * @noema/web - Session / AdaptiveCheckpoint
 *
 * Non-blocking informational panel shown when the session engine emits a
 * checkpoint directive. Appears above the card area without covering the full
 * screen. Displays the directive action label, reason text, and optional
 * suggested mode.
 */

import * as React from 'react';
import { Info } from 'lucide-react';
import { Button } from '@noema/ui';

// ============================================================================
// Types — mirrors ICheckpointDirectiveDto from @noema/api-client/session
// ============================================================================

type CheckpointAction = 'continue' | 'pause' | 'complete' | 'switch_mode';

type SessionMode = 'standard' | 'cram' | 'preview' | 'test';

interface ICheckpointDirective {
  action: CheckpointAction;
  reason: string;
  suggestedMode?: SessionMode;
}

export interface IAdaptiveCheckpointProps {
  directive: ICheckpointDirective;
  onDismiss: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const ACTION_LABELS: Record<CheckpointAction, string> = {
  continue: 'Continuing',
  pause: 'Suggested Pause',
  complete: 'Session Complete',
  switch_mode: 'Mode Switch Suggested',
};

// ============================================================================
// AdaptiveCheckpoint
// ============================================================================

export function AdaptiveCheckpoint({
  directive,
  onDismiss,
}: IAdaptiveCheckpointProps): React.JSX.Element {
  const actionLabel = ACTION_LABELS[directive.action];

  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100"
      role="status"
      aria-live="polite"
      aria-label={`Checkpoint: ${actionLabel}`}
    >
      {/* Info icon */}
      <Info
        className="mt-0.5 h-5 w-5 shrink-0 text-blue-500 dark:text-blue-400"
        aria-hidden="true"
      />

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-semibold leading-snug">{actionLabel}</p>
        <p className="text-sm leading-snug opacity-80">{directive.reason}</p>
        {directive.suggestedMode !== undefined && (
          <p className="text-xs font-medium opacity-70">
            {'Suggested mode: '}
            <span className="capitalize">{directive.suggestedMode}</span>
          </p>
        )}
      </div>

      {/* Dismiss */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onDismiss}
        className="shrink-0 text-blue-700 hover:bg-blue-100 hover:text-blue-900 dark:text-blue-300 dark:hover:bg-blue-900 dark:hover:text-blue-100"
      >
        Understood
      </Button>
    </div>
  );
}
