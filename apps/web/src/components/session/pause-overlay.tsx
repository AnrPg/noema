'use client';

/**
 * @noema/web - Session / PauseOverlay
 *
 * Semi-transparent fullscreen overlay shown when the session is paused.
 * Displays elapsed time in "X min Y sec" format, a "Session Paused" heading,
 * and a Resume button.
 */

import * as React from 'react';
import { PauseCircle } from 'lucide-react';
import { Button } from '@noema/ui';

// ============================================================================
// Types
// ============================================================================

export interface IPauseOverlayProps {
  elapsedMs: number;
  onResume: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Formats elapsed milliseconds as "X min Y sec".
 * e.g. 127_000 ms → "2 min 7 sec"
 */
function formatElapsedVerbose(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes)} min ${String(seconds)} sec`;
}

// ============================================================================
// PauseOverlay
// ============================================================================

export function PauseOverlay({ elapsedMs, onResume }: IPauseOverlayProps): React.JSX.Element {
  const elapsed = formatElapsedVerbose(elapsedMs);

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Session paused"
    >
      <div className="flex flex-col items-center gap-6 text-center">
        <PauseCircle className="h-16 w-16 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Session Paused</h2>
          <p className="text-sm text-muted-foreground" aria-label={`Elapsed time: ${elapsed}`}>
            {elapsed} elapsed
          </p>
        </div>
        <Button onClick={onResume} size="lg">
          Resume
        </Button>
      </div>
    </div>
  );
}
