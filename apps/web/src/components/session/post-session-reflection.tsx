'use client';

/**
 * @noema/web - Session / PostSessionReflection
 *
 * Three free-text textarea prompts for post-session metacognitive reflection.
 * Persists to localStorage keyed by sessionId.
 * API persistence is deferred to Phase 10.
 */

import * as React from 'react';

// ============================================================================
// Types
// ============================================================================

interface IPostSessionReflectionProps {
  sessionId: string;
}

interface IReflectionFields {
  hardestConcept: string;
  misconceptions: string;
  wouldDoDifferently: string;
}

// ============================================================================
// Helpers
// ============================================================================

const PROMPTS: {
  key: keyof IReflectionFields;
  label: string;
  placeholder: string;
}[] = [
  {
    key: 'hardestConcept',
    label: 'What was the hardest concept?',
    placeholder: 'Describe the concept or card that challenged you most…',
  },
  {
    key: 'misconceptions',
    label: 'Did any misconceptions surprise you?',
    placeholder: 'Note any false beliefs you discovered…',
  },
  {
    key: 'wouldDoDifferently',
    label: 'What would you do differently?',
    placeholder: 'Reflect on study strategies, pacing, or approach…',
  },
];

function storageKey(sessionId: string): string {
  return `session-reflection-${sessionId}`;
}

function loadFromStorage(sessionId: string): IReflectionFields {
  try {
    const raw = localStorage.getItem(storageKey(sessionId));
    if (raw !== null) {
      return JSON.parse(raw) as IReflectionFields;
    }
  } catch {
    // localStorage unavailable or JSON malformed — fall through to defaults
  }
  return { hardestConcept: '', misconceptions: '', wouldDoDifferently: '' };
}

function saveToStorage(sessionId: string, fields: IReflectionFields): void {
  try {
    localStorage.setItem(storageKey(sessionId), JSON.stringify(fields));
  } catch {
    // localStorage unavailable — silently ignore
  }
}

// ============================================================================
// PostSessionReflection
// ============================================================================

export function PostSessionReflection({
  sessionId,
}: IPostSessionReflectionProps): React.JSX.Element {
  const [fields, setFields] = React.useState<IReflectionFields>(() => loadFromStorage(sessionId));
  const [saved, setSaved] = React.useState(false);

  function handleChange(key: keyof IReflectionFields, value: string): void {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave(): void {
    saveToStorage(sessionId, fields);
    setSaved(true);
  }

  if (saved) {
    return (
      <div className="flex min-h-[80px] items-center justify-center rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground">
        Reflection saved.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {PROMPTS.map(({ key, label, placeholder }) => (
        <div key={key} className="space-y-1.5">
          <label
            htmlFor={`reflection-${key}`}
            className="block text-sm font-medium text-foreground"
          >
            {label}
          </label>
          <textarea
            id={`reflection-${key}`}
            rows={3}
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-synapse-400/50"
            placeholder={placeholder}
            value={fields[key]}
            onChange={(e) => {
              handleChange(key, e.target.value);
            }}
          />
        </div>
      ))}

      <button
        type="button"
        onClick={handleSave}
        className="inline-flex items-center rounded-md bg-synapse-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-synapse-600 focus:outline-none focus:ring-2 focus:ring-synapse-400/50 focus:ring-offset-2"
      >
        Save Reflection
      </button>
    </div>
  );
}
