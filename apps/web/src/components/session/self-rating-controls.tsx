'use client';

import * as React from 'react';
import { Circle, CircleDot, Gauge } from 'lucide-react';
import { StepSelfRating } from '@noema/types';
import type { StepSelfRating as StepSelfRatingValue } from '@noema/types';

interface ISelfRatingControlsProps {
  value: StepSelfRatingValue;
  disabled?: boolean;
  onChange: (value: StepSelfRatingValue) => void;
}

const OPTIONS: {
  value: StepSelfRatingValue;
  label: string;
  supportingLabel: string;
}[] = [
  {
    value: StepSelfRating.KNEW_IT,
    label: 'Knew it',
    supportingLabel: 'Clear recall',
  },
  {
    value: StepSelfRating.HESITATED,
    label: 'Hesitated',
    supportingLabel: 'Partial recall',
  },
  {
    value: StepSelfRating.DIDNT_KNOW,
    label: "Didn't know",
    supportingLabel: 'Needs repair',
  },
];

export function SelfRatingControls({
  value,
  disabled = false,
  onChange,
}: ISelfRatingControlsProps): React.JSX.Element {
  return (
    <fieldset className="space-y-2">
      <legend className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
        Self-rating
      </legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {OPTIONS.map((option) => {
          const selected = value === option.value;
          const Icon = selected ? CircleDot : Circle;

          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => {
                onChange(option.value);
              }}
              className={[
                'flex min-h-16 items-center gap-3 rounded-lg border px-3 py-2 text-left transition',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-foreground hover:bg-muted',
                disabled ? 'cursor-not-allowed opacity-60' : '',
              ].join(' ')}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{option.label}</span>
                <span
                  className={[
                    'block text-xs',
                    selected ? 'text-primary-foreground/80' : 'text-muted-foreground',
                  ].join(' ')}
                >
                  {option.supportingLabel}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
