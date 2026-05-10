import * as React from 'react';
import { cn } from '../lib/utils.js';
import { FieldLabel } from './field-label.js';

export interface DomainSuggestionFieldSuggestion {
  label: string;
  confidence: number;
  matchType: 'exact' | 'alias' | 'fuzzy' | 'related';
  source: 'pkg' | 'ckg' | 'mixed';
  nodeCount: number;
}

export interface DomainSuggestionFieldResolution {
  resolvedDomain: string | null;
  needsDecision: boolean;
  suggestions: DomainSuggestionFieldSuggestion[];
  proposedDomains: string[];
}

export interface DomainSuggestionFieldProps {
  label: React.ReactNode;
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string | undefined;
  required?: boolean | undefined;
  helperText?: React.ReactNode;
  resolution?: DomainSuggestionFieldResolution | null | undefined;
  isLoading?: boolean | undefined;
  onApplySuggestion?: ((nextValue: string) => void) | undefined;
  className?: string | undefined;
  inputClassName?: string | undefined;
}

const baseInputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';

export function DomainSuggestionField({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  helperText,
  resolution,
  isLoading = false,
  onApplySuggestion,
  className,
  inputClassName,
}: DomainSuggestionFieldProps): React.JSX.Element {
  const applySuggestion = React.useCallback(
    (nextValue: string) => {
      if (onApplySuggestion !== undefined) {
        onApplySuggestion(nextValue);
        return;
      }
      onChange(nextValue);
    },
    [onApplySuggestion, onChange]
  );

  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <FieldLabel className="text-sm font-medium text-foreground" required={required}>
        {label}
      </FieldLabel>
      <input
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        placeholder={placeholder}
        className={cn(baseInputClass, inputClassName)}
      />

      {helperText !== undefined ? (
        <span className="text-xs text-muted-foreground">{helperText}</span>
      ) : null}

      {resolution?.resolvedDomain !== null && resolution?.resolvedDomain !== undefined ? (
        <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground">
          Canonical match ready: <span className="font-medium">{resolution.resolvedDomain}</span>
        </div>
      ) : null}

      {resolution?.needsDecision === true ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900">
          This domain is close to multiple existing categories. Pick one below before saving so the
          graph meaning stays precise.
        </div>
      ) : null}

      {isLoading ? (
        <span className="text-xs text-muted-foreground">Refreshing domain suggestions…</span>
      ) : null}

      {resolution !== undefined && resolution !== null && resolution.suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {resolution.suggestions.map((suggestion) => (
            <button
              key={`${suggestion.label}:${suggestion.source}`}
              type="button"
              onClick={() => {
                applySuggestion(suggestion.label);
              }}
              className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted"
            >
              {suggestion.label}
              <span className="ml-1 text-muted-foreground">
                {suggestion.source} · {Math.round(suggestion.confidence * 100)}%
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {resolution !== undefined && resolution !== null && resolution.proposedDomains.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {resolution.proposedDomains.map((proposal) => (
            <button
              key={proposal}
              type="button"
              onClick={() => {
                applySuggestion(proposal);
              }}
              className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
            >
              Use new domain: {proposal}
            </button>
          ))}
        </div>
      ) : null}
    </label>
  );
}
