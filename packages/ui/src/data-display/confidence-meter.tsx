/**
 * @noema/ui - ConfidenceMeter
 *
 * Segmented confidence bar — display-only or interactive via native range input.
 */
import type { JSX } from 'react';
import { cn } from '../lib/utils.js';

// Qualitative label array — index maps to quintile (0 = lowest)
const CONFIDENCE_LABELS = [
  'Guessing',
  'Uncertain',
  'Somewhat sure',
  'Confident',
  'Certain',
] as const;

// Segment fill colors (5 positions, cortex → myelin gradient)
// Static strings for Tailwind JIT safety
const SEGMENT_FILL = [
  'bg-cortex-400',
  'bg-cortex-200',
  'bg-axon-400',
  'bg-myelin-200',
  'bg-myelin-400',
] as const;

// Default fill for non-standard segment counts
const DEFAULT_FILL = 'bg-myelin-400';

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function getFilledCount(value: number, segments: number): number {
  return Math.round(clamp(value) * segments);
}

function getLabel(value: number): string {
  const clamped = clamp(value);
  // Math.min ensures index is always 0–4; ?? guards TypeScript's strict tuple access
  const index = Math.min(CONFIDENCE_LABELS.length - 1, Math.floor(clamped * 5));
  return CONFIDENCE_LABELS[index] ?? 'Certain';
}

function getPercent(value: number): number {
  return Math.round(clamp(value) * 100);
}

interface IConfidenceMeterProps {
  value: number; // 0–1
  onChange?: (value: number) => void;
  segments?: number;
  showLabel?: boolean;
  className?: string;
}

export function ConfidenceMeter({
  value,
  onChange,
  segments = 5,
  showLabel = false,
  className,
}: IConfidenceMeterProps): JSX.Element {
  const filledCount = getFilledCount(value, segments);
  const percent = getPercent(value);

  return (
    <div
      className={cn('flex flex-col gap-1', className)}
      role={onChange === undefined ? 'meter' : undefined}
      aria-valuenow={onChange === undefined ? percent : undefined}
      aria-valuemin={onChange === undefined ? 0 : undefined}
      aria-valuemax={onChange === undefined ? 100 : undefined}
      aria-label={
        onChange === undefined ? (showLabel ? getLabel(value) : 'Confidence level') : undefined
      }
    >
      <div className="relative h-3">
        {/* Visual segmented bar */}
        <div className="absolute inset-0 flex gap-0.5">
          {Array.from({ length: segments }, (_, i) => {
            const isFilled = i < filledCount;
            const fillClass =
              segments === 5
                ? isFilled
                  ? (SEGMENT_FILL[i] ?? DEFAULT_FILL)
                  : 'bg-axon-100'
                : isFilled
                  ? DEFAULT_FILL
                  : 'bg-axon-100';
            return (
              <div
                key={i}
                data-testid="cm-segment"
                data-filled={isFilled}
                className={cn('flex-1 rounded-sm', fillClass)}
              />
            );
          })}
        </div>
        {/* Invisible range input backing (interactive mode only) */}
        {onChange !== undefined && (
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={value}
            onChange={(e) => {
              onChange(parseFloat(e.target.value));
            }}
            aria-label={`Confidence level: ${String(percent)}%`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        )}
      </div>
      {showLabel && <span className="text-caption text-axon-400">{getLabel(value)}</span>}
    </div>
  );
}
