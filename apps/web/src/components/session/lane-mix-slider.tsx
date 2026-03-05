'use client';

/**
 * @noema/web - Session / LaneMixSlider
 *
 * Dual-lane ratio control for the session start page. A single range slider
 * (0–100) where `value = retentionPct` and `calibrationPct = 100 - value`.
 * Renders a split colour bar beneath the thumb showing the blue retention
 * portion and the amber calibration portion, proportional to the current value.
 */

import * as React from 'react';
import { Brain, Zap } from 'lucide-react';

// ============================================================================
// Props
// ============================================================================

interface ILaneMixSliderProps {
  /** Retention percentage 0–100. Calibration = 100 - retentionPct. */
  retentionPct: number;
  onChange: (retentionPct: number) => void;
  /** Optional estimated retention lane card count */
  retentionCount?: number;
  /** Optional estimated calibration lane card count */
  calibrationCount?: number;
}

// ============================================================================
// LaneMixSlider
// ============================================================================

export function LaneMixSlider({
  retentionPct,
  onChange,
  retentionCount,
  calibrationCount,
}: ILaneMixSliderProps): React.JSX.Element {
  const calibrationPct = 100 - retentionPct;

  const ariaLabel = [
    'Lane mix:',
    String(retentionPct) + '% Retention,',
    String(calibrationPct) + '% Calibration',
  ].join(' ');

  return (
    <div className="flex flex-col gap-3">
      {/* Label row */}
      <div className="flex items-center justify-between gap-2">
        {/* Retention label (left) */}
        <div className="flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400">
          <Brain className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Retention <span className="tabular-nums">{String(retentionPct)}%</span>
            {retentionCount !== undefined && (
              <span className="ml-1 font-normal text-muted-foreground">
                ({String(retentionCount)})
              </span>
            )}
          </span>
        </div>

        {/* Calibration label (right) */}
        <div className="flex items-center gap-1.5 text-sm font-medium text-amber-600 dark:text-amber-400">
          <span>
            Calibration <span className="tabular-nums">{String(calibrationPct)}%</span>
            {calibrationCount !== undefined && (
              <span className="ml-1 font-normal text-muted-foreground">
                ({String(calibrationCount)})
              </span>
            )}
          </span>
          <Zap className="h-4 w-4 shrink-0" aria-hidden="true" />
        </div>
      </div>

      {/* Range slider */}
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={retentionPct}
        aria-label={ariaLabel}
        onChange={(e) => {
          onChange(Number(e.target.value));
        }}
        className="w-full cursor-pointer accent-blue-500"
      />

      {/* Split colour bar */}
      <div className="flex h-2 w-full overflow-hidden rounded-full">
        <div
          className="h-full bg-blue-500 transition-all"
          style={{ width: String(retentionPct) + '%' }}
          aria-hidden="true"
        />
        <div className="h-full flex-1 bg-amber-400 transition-all" aria-hidden="true" />
      </div>
    </div>
  );
}
