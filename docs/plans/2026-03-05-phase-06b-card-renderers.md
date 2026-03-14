# Phase 06-B — Card System: Card Renderers (42 Types)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build 42 React card renderer components — 22 standard + 20 remediation types — plus the CardRenderer factory that dispatches to them. Used by both the Card Library (preview mode) and Session Engine (interactive mode).

**Architecture:** Each renderer implements `ICardRendererProps` (mode=preview|interactive, isRevealed, onAnswer?, onHintRequest?). The factory `CardRenderer` maps `card.cardType` to the right component. All renderers share a `CardShell` wrapper for consistent chrome. Preview mode is compact; interactive mode shows the full learning interaction.

**Tech Stack:** React, TypeScript, `@noema/ui` (Card, Button, etc.), `lucide-react` icons, `@noema/api-client` types (ICardDto, CardContentByType)

**Critical context:**
- Content fields per type are in `packages/api-client/src/content/types.ts` (Phase 06-A output)
- `card.cardType` values are lowercase strings: `'atomic'`, `'cloze'`, `'image_occlusion'` etc.
- In `preview` mode: compact static card face, front text clamped to 2-3 lines
- In `interactive` mode: full learning interaction (inputs, drag, flip, etc.)
- `isRevealed` is controlled externally by the session engine
- All Tailwind classes must be static — no dynamic string construction for JIT
- Import `CardType` and `RemediationCardType` from `@noema/types` for the factory switch
- For drag-and-drop use HTML5 native drag events (no external deps needed for these renderers)
- Cloze template format: `"The {{c1::capital}} of France is {{c2::Paris}}."`
- Parse cloze template with `String.prototype.matchAll` (avoid RegExp .exec loops)

---

### Task 5: Renderer Types + Factory + CardShell

**Files:**
- Create: `apps/web/src/components/card-renderers/types.ts`
- Create: `apps/web/src/components/card-renderers/card-shell.tsx`
- Create: `apps/web/src/components/card-renderers/fallback-renderer.tsx`
- Create: `apps/web/src/components/card-renderers/index.tsx`

**Step 1: Create `types.ts`**

```typescript
// apps/web/src/components/card-renderers/types.ts
import type { ICardDto } from '@noema/api-client';

export type CardRendererMode = 'preview' | 'interactive';

export interface ICardRendererProps {
  card: ICardDto;
  mode: CardRendererMode;
  isRevealed: boolean;
  onAnswer?: (answer: unknown) => void;
  onHintRequest?: () => void;
  onReveal?: () => void;
  className?: string;
}
```

**Step 2: Create `card-shell.tsx`**

```typescript
// apps/web/src/components/card-renderers/card-shell.tsx
'use client';

import { Card, CardContent } from '@noema/ui';
import type { CardRendererMode } from './types.js';

interface ICardShellProps {
  mode: CardRendererMode;
  frontContent: React.ReactNode;
  backContent?: React.ReactNode;
  isRevealed: boolean;
  onReveal?: () => void;
  hint?: string;
  children?: React.ReactNode;
  className?: string;
}

export function CardShell({
  mode,
  frontContent,
  backContent,
  isRevealed,
  onReveal,
  hint,
  children,
  className = '',
}: ICardShellProps): React.JSX.Element {
  if (mode === 'preview') {
    return (
      <Card className={`h-full ${className}`}>
        <CardContent className="p-4">
          <div className="text-sm text-foreground line-clamp-3">{frontContent}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`w-full ${className}`}>
      <CardContent className="p-6 space-y-4">
        <div className="text-base leading-relaxed">{frontContent}</div>

        {!isRevealed && hint !== undefined && hint !== '' && (
          <p className="text-sm text-muted-foreground italic border-l-2 border-synapse-400/40 pl-3">
            Hint: {hint}
          </p>
        )}

        {isRevealed && backContent !== undefined && (
          <>
            <div className="border-t border-border" />
            <div className="text-base leading-relaxed text-foreground/90">{backContent}</div>
          </>
        )}

        {!isRevealed && onReveal !== undefined && backContent !== undefined && (
          <button
            type="button"
            onClick={onReveal}
            className="w-full rounded-lg border border-synapse-400/30 py-2 text-sm text-synapse-400 hover:bg-synapse-400/5 transition-colors"
          >
            Show Answer
          </button>
        )}

        {children}
      </CardContent>
    </Card>
  );
}
```

**Step 3: Create `fallback-renderer.tsx`**

```typescript
// apps/web/src/components/card-renderers/fallback-renderer.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@noema/ui';
import type { ICardRendererProps } from './types.js';

export function FallbackRenderer({ card, mode }: ICardRendererProps): React.JSX.Element {
  if (mode === 'preview') {
    return (
      <Card className="h-full">
        <CardContent className="p-4">
          <span className="text-xs text-muted-foreground font-mono">{card.cardType}</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-sm font-mono text-muted-foreground">{card.cardType}</CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="text-xs overflow-auto bg-muted rounded-md p-4 max-h-80">
          {JSON.stringify(card.content, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}
```

**Step 4: Create `index.tsx` factory stub**

```typescript
// apps/web/src/components/card-renderers/index.tsx
'use client';

import { CardType, RemediationCardType } from '@noema/types';
import { FallbackRenderer } from './fallback-renderer.js';
import type { ICardRendererProps } from './types.js';

// Renderer imports — filled in Tasks 6-12.
// Replace each FallbackRenderer as the matching task completes.

const RENDERER_MAP: Record<string, React.ComponentType<ICardRendererProps>> = {
  [CardType.ATOMIC]: FallbackRenderer,
  [CardType.CLOZE]: FallbackRenderer,
  [CardType.IMAGE_OCCLUSION]: FallbackRenderer,
  [CardType.AUDIO]: FallbackRenderer,
  [CardType.PROCESS]: FallbackRenderer,
  [CardType.COMPARISON]: FallbackRenderer,
  [CardType.EXCEPTION]: FallbackRenderer,
  [CardType.ERROR_SPOTTING]: FallbackRenderer,
  [CardType.CONFIDENCE_RATED]: FallbackRenderer,
  [CardType.CONCEPT_GRAPH]: FallbackRenderer,
  [CardType.CASE_BASED]: FallbackRenderer,
  [CardType.MULTIMODAL]: FallbackRenderer,
  [CardType.TRANSFER]: FallbackRenderer,
  [CardType.PROGRESSIVE_DISCLOSURE]: FallbackRenderer,
  [CardType.MULTIPLE_CHOICE]: FallbackRenderer,
  [CardType.TRUE_FALSE]: FallbackRenderer,
  [CardType.MATCHING]: FallbackRenderer,
  [CardType.ORDERING]: FallbackRenderer,
  [CardType.DEFINITION]: FallbackRenderer,
  [CardType.CAUSE_EFFECT]: FallbackRenderer,
  [CardType.TIMELINE]: FallbackRenderer,
  [CardType.DIAGRAM]: FallbackRenderer,
  [RemediationCardType.CONTRASTIVE_PAIR]: FallbackRenderer,
  [RemediationCardType.MINIMAL_PAIR]: FallbackRenderer,
  [RemediationCardType.FALSE_FRIEND]: FallbackRenderer,
  [RemediationCardType.OLD_VS_NEW_DEFINITION]: FallbackRenderer,
  [RemediationCardType.BOUNDARY_CASE]: FallbackRenderer,
  [RemediationCardType.RULE_SCOPE]: FallbackRenderer,
  [RemediationCardType.DISCRIMINANT_FEATURE]: FallbackRenderer,
  [RemediationCardType.ASSUMPTION_CHECK]: FallbackRenderer,
  [RemediationCardType.COUNTEREXAMPLE]: FallbackRenderer,
  [RemediationCardType.REPRESENTATION_SWITCH]: FallbackRenderer,
  [RemediationCardType.RETRIEVAL_CUE]: FallbackRenderer,
  [RemediationCardType.ENCODING_REPAIR]: FallbackRenderer,
  [RemediationCardType.OVERWRITE_DRILL]: FallbackRenderer,
  [RemediationCardType.AVAILABILITY_BIAS_DISCONFIRMATION]: FallbackRenderer,
  [RemediationCardType.SELF_CHECK_RITUAL]: FallbackRenderer,
  [RemediationCardType.CALIBRATION_TRAINING]: FallbackRenderer,
  [RemediationCardType.ATTRIBUTION_REFRAMING]: FallbackRenderer,
  [RemediationCardType.STRATEGY_REMINDER]: FallbackRenderer,
  [RemediationCardType.CONFUSABLE_SET_DRILL]: FallbackRenderer,
  [RemediationCardType.PARTIAL_KNOWLEDGE_DECOMPOSITION]: FallbackRenderer,
};

export function CardRenderer(props: ICardRendererProps): React.JSX.Element {
  const Renderer = RENDERER_MAP[props.card.cardType] ?? FallbackRenderer;
  return <Renderer {...props} />;
}

export type { ICardRendererProps, CardRendererMode } from './types.js';
```

**Step 5: Build check**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | head -20
```

**Step 6: Commit**

```bash
git add apps/web/src/components/card-renderers/
git commit -m "feat(web): card renderer shell, fallback, factory stub"
```

---

### Task 6: Standard Renderers Group A — Flip-Style Cards

Types: ATOMIC, DEFINITION, TRUE_FALSE, MULTIPLE_CHOICE, CONFIDENCE_RATED

**Files:**
- Create: `apps/web/src/components/card-renderers/atomic.tsx`
- Create: `apps/web/src/components/card-renderers/definition.tsx`
- Create: `apps/web/src/components/card-renderers/true-false.tsx`
- Create: `apps/web/src/components/card-renderers/multiple-choice.tsx`
- Create: `apps/web/src/components/card-renderers/confidence-rated.tsx`
- Modify: `apps/web/src/components/card-renderers/index.tsx`

**Step 1: `atomic.tsx`**

```typescript
// apps/web/src/components/card-renderers/atomic.tsx
'use client';
import type { IAtomicContent } from '@noema/api-client';
import { CardShell } from './card-shell.js';
import type { ICardRendererProps } from './types.js';

export function AtomicCardRenderer({ card, mode, isRevealed, onReveal }: ICardRendererProps): React.JSX.Element {
  const content = card.content as IAtomicContent;
  return (
    <CardShell
      mode={mode}
      frontContent={<p className="whitespace-pre-wrap">{content.front}</p>}
      backContent={<p className="whitespace-pre-wrap">{content.back}</p>}
      isRevealed={isRevealed}
      onReveal={onReveal}
      hint={content.hint}
    />
  );
}
```

**Step 2: `definition.tsx`**

```typescript
// apps/web/src/components/card-renderers/definition.tsx
'use client';
import type { IDefinitionContent } from '@noema/api-client';
import { CardShell } from './card-shell.js';
import type { ICardRendererProps } from './types.js';

export function DefinitionRenderer({ card, mode, isRevealed, onReveal }: ICardRendererProps): React.JSX.Element {
  const content = card.content as IDefinitionContent;
  return (
    <CardShell
      mode={mode}
      frontContent={
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Term</p>
          <p className="text-lg font-semibold">{content.term}</p>
        </div>
      }
      backContent={
        <div className="space-y-3">
          <p>{content.definition}</p>
          {content.examples !== undefined && content.examples.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Examples</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {content.examples.map((ex, i) => <li key={String(i)}>{ex}</li>)}
              </ul>
            </div>
          )}
        </div>
      }
      isRevealed={isRevealed}
      onReveal={onReveal}
      hint={content.hint}
    />
  );
}
```

**Step 3: `true-false.tsx`**

```typescript
// apps/web/src/components/card-renderers/true-false.tsx
'use client';
import type { ITrueFalseContent } from '@noema/api-client';
import { useState } from 'react';
import { Card, CardContent } from '@noema/ui';
import type { ICardRendererProps } from './types.js';

export function TrueFalseRenderer({ card, mode, isRevealed, onAnswer, onReveal }: ICardRendererProps): React.JSX.Element {
  const content = card.content as ITrueFalseContent;
  const [selected, setSelected] = useState<boolean | null>(null);

  if (mode === 'preview') {
    return (
      <Card className="h-full">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">True / False</p>
          <p className="text-sm line-clamp-3">{content.statement}</p>
        </CardContent>
      </Card>
    );
  }

  const handleSelect = (value: boolean): void => {
    setSelected(value);
    onAnswer?.(value);
    onReveal?.();
  };

  const resultColor = selected !== null && isRevealed
    ? selected === content.isTrue ? 'text-dendrite-400' : 'text-cortex-400'
    : '';

  return (
    <Card className="w-full">
      <CardContent className="p-6 space-y-4">
        <p className="text-base leading-relaxed">{content.statement}</p>
        {!isRevealed && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { handleSelect(true); }}
              className={`flex-1 rounded-lg border py-3 font-medium transition-colors
                ${selected === true ? 'border-dendrite-400 bg-dendrite-400/10 text-dendrite-400' : 'border-border hover:border-dendrite-400/50'}`}
            >
              True
            </button>
            <button
              type="button"
              onClick={() => { handleSelect(false); }}
              className={`flex-1 rounded-lg border py-3 font-medium transition-colors
                ${selected === false ? 'border-cortex-400 bg-cortex-400/10 text-cortex-400' : 'border-border hover:border-cortex-400/50'}`}
            >
              False
            </button>
          </div>
        )}
        {isRevealed && (
          <div className="border-t pt-3">
            <p className={`font-medium ${resultColor}`}>
              {content.isTrue ? 'True' : 'False'}
            </p>
            {content.explanation !== undefined && (
              <p className="text-sm text-muted-foreground mt-2">{content.explanation}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 4: `multiple-choice.tsx`**

```typescript
// apps/web/src/components/card-renderers/multiple-choice.tsx
'use client';
import type { IMultipleChoiceContent } from '@noema/api-client';
import { useMemo, useState } from 'react';
import { Card, CardContent } from '@noema/ui';
import type { ICardRendererProps } from './types.js';

export function MultipleChoiceRenderer({ card, mode, isRevealed, onAnswer, onReveal }: ICardRendererProps): React.JSX.Element {
  const content = card.content as IMultipleChoiceContent;
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const choices = useMemo(
    () => content.choices.map((c, i) => ({ ...c, originalIndex: i })),
    [content.choices]
  );

  if (mode === 'preview') {
    return (
      <Card className="h-full">
        <CardContent className="p-4">
          <p className="text-sm line-clamp-2">{content.front}</p>
          <p className="text-xs text-muted-foreground mt-1">{String(content.choices.length)} choices</p>
        </CardContent>
      </Card>
    );
  }

  const handleSelect = (idx: number): void => {
    if (isRevealed) return;
    if (content.allowMultiple === true) {
      const next = new Set(selected);
      if (next.has(idx)) { next.delete(idx); } else { next.add(idx); }
      setSelected(next);
    } else {
      setSelected(new Set([idx]));
      onAnswer?.(idx);
      onReveal?.();
    }
  };

  return (
    <Card className="w-full">
      <CardContent className="p-6 space-y-4">
        <p className="text-base leading-relaxed">{content.front}</p>
        <div className="space-y-2">
          {choices.map((choice, i) => {
            const isSelected = selected.has(i);
            const correct = isRevealed && choice.correct;
            const wrong = isRevealed && isSelected && !choice.correct;
            const borderClass = correct
              ? 'border-dendrite-400 bg-dendrite-400/10'
              : wrong
              ? 'border-cortex-400 bg-cortex-400/10'
              : isSelected
              ? 'border-synapse-400 bg-synapse-400/10'
              : 'border-border hover:border-synapse-400/50';

            return (
              <button
                key={String(choice.originalIndex)}
                type="button"
                disabled={isRevealed}
                onClick={() => { handleSelect(i); }}
                className={`w-full text-left rounded-lg border p-3 text-sm transition-colors ${borderClass}`}
              >
                <span className="font-semibold mr-2">{String.fromCharCode(65 + i)}.</span>
                {choice.text}
                {isRevealed && choice.feedback !== undefined && (
                  <p className="text-xs text-muted-foreground mt-1">{choice.feedback}</p>
                )}
              </button>
            );
          })}
        </div>
        {content.allowMultiple === true && !isRevealed && selected.size > 0 && (
          <button
            type="button"
            onClick={() => { onAnswer?.(Array.from(selected)); onReveal?.(); }}
            className="w-full rounded-lg bg-synapse-400 text-white py-2 text-sm font-medium"
          >
            Submit
          </button>
        )}
        {isRevealed && content.explanation !== undefined && (
          <p className="text-sm text-muted-foreground border-t pt-3">{content.explanation}</p>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 5: `confidence-rated.tsx`**

```typescript
// apps/web/src/components/card-renderers/confidence-rated.tsx
'use client';
import type { IConfidenceRatedContent } from '@noema/api-client';
import { useState } from 'react';
import { Card, CardContent } from '@noema/ui';
import type { ICardRendererProps } from './types.js';

export function ConfidenceRatedRenderer({ card, mode, isRevealed, onAnswer, onReveal }: ICardRendererProps): React.JSX.Element {
  const content = card.content as IConfidenceRatedContent;
  const scale = content.confidenceScale ?? { min: 1, max: 5 };
  const [preConfidence, setPreConfidence] = useState<number | null>(null);
  const [postConfidence, setPostConfidence] = useState<number | null>(null);

  if (mode === 'preview') {
    return (
      <Card className="h-full">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Confidence rated</p>
          <p className="text-sm line-clamp-3">{content.front}</p>
        </CardContent>
      </Card>
    );
  }

  const levels = Array.from({ length: scale.max - scale.min + 1 }, (_, i) => scale.min + i);

  return (
    <Card className="w-full">
      <CardContent className="p-6 space-y-5">
        <p className="text-base leading-relaxed">{content.front}</p>

        {preConfidence === null && (
          <div>
            <p className="text-sm text-muted-foreground mb-2">Confidence before answering (1–{String(scale.max)})</p>
            <div className="flex gap-2">
              {levels.map((level) => (
                <button key={String(level)} type="button" onClick={() => { setPreConfidence(level); }}
                  className="flex-1 rounded border border-border py-2 text-sm hover:border-synapse-400/50 transition-colors">
                  {String(level)}
                </button>
              ))}
            </div>
          </div>
        )}

        {preConfidence !== null && !isRevealed && (
          <button type="button" onClick={onReveal}
            className="w-full rounded-lg border border-synapse-400/30 py-2 text-sm text-synapse-400 hover:bg-synapse-400/5 transition-colors">
            Show Answer
          </button>
        )}

        {isRevealed && (
          <>
            <div className="border-t pt-4 space-y-2">
              <p className="text-base">{content.correctAnswer}</p>
              {content.calibrationFeedback !== undefined && (
                <p className="text-sm text-muted-foreground">{content.calibrationFeedback}</p>
              )}
            </div>

            {postConfidence === null && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">Confidence after seeing answer</p>
                <div className="flex gap-2">
                  {levels.map((level) => (
                    <button key={String(level)} type="button"
                      onClick={() => { setPostConfidence(level); onAnswer?.({ preConfidence, postConfidence: level }); }}
                      className="flex-1 rounded border border-border py-2 text-sm hover:border-myelin-400/50 transition-colors">
                      {String(level)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 6: Wire into index.tsx**

```typescript
import { AtomicCardRenderer } from './atomic.js';
import { DefinitionRenderer } from './definition.js';
import { TrueFalseRenderer } from './true-false.js';
import { MultipleChoiceRenderer } from './multiple-choice.js';
import { ConfidenceRatedRenderer } from './confidence-rated.js';
// In RENDERER_MAP update these 5 entries
```

**Step 7: Commit**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep -c error || echo "ok"
git add apps/web/src/components/card-renderers/
git commit -m "feat(web): flip-style renderers (atomic, definition, true-false, multiple-choice, confidence-rated)"
```

---

### Task 7: Standard Renderers Group B — Sequence / Fill Interactions

Types: CLOZE, MATCHING, ORDERING, PROCESS, TIMELINE, CAUSE_EFFECT

**Files:** One file per type + index update.

**Step 1: `cloze.tsx`**

Parse the cloze template using `String.prototype.matchAll` with the pattern `/\{\{c(\d+)::([^}]+)\}\}/g`.

```typescript
// apps/web/src/components/card-renderers/cloze.tsx
'use client';
import type { IClozeContent } from '@noema/api-client';
import { useState, useMemo } from 'react';
import { Card, CardContent } from '@noema/ui';
import type { ICardRendererProps } from './types.js';

interface IClozeToken {
  type: 'text' | 'cloze';
  text?: string;
  index?: number;
  answer?: string;
}

function parseClozeTemplate(template: string): IClozeToken[] {
  const tokens: IClozeToken[] = [];
  let lastIndex = 0;
  let clozeIndex = 0;
  const pattern = /\{\{c\d+::([^}]+)\}\}/g;

  for (const m of template.matchAll(pattern)) {
    const matchStart = m.index ?? 0;
    if (matchStart > lastIndex) {
      tokens.push({ type: 'text', text: template.slice(lastIndex, matchStart) });
    }
    tokens.push({ type: 'cloze', index: clozeIndex, answer: m[1] ?? '' });
    lastIndex = matchStart + m[0].length;
    clozeIndex++;
  }

  if (lastIndex < template.length) {
    tokens.push({ type: 'text', text: template.slice(lastIndex) });
  }
  return tokens;
}

export function ClozeCardRenderer({ card, mode, isRevealed, onAnswer, onReveal }: ICardRendererProps): React.JSX.Element {
  const content = card.content as IClozeContent;
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const tokens = useMemo(() => parseClozeTemplate(content.template), [content.template]);

  if (mode === 'preview') {
    const preview = content.template.replace(/\{\{c\d+::([^}]+)\}\}/g, '___');
    return (
      <Card className="h-full">
        <CardContent className="p-4">
          <p className="text-sm line-clamp-3">{preview}</p>
        </CardContent>
      </Card>
    );
  }

  const clozeCount = tokens.filter((t) => t.type === 'cloze').length;
  const allFilled = Object.keys(answers).length === clozeCount &&
    Object.values(answers).every((v) => v.trim() !== '');

  return (
    <Card className="w-full">
      <CardContent className="p-6 space-y-4">
        <p className="text-xs text-muted-foreground">Fill in the blanks:</p>
        <div className="text-base leading-relaxed flex flex-wrap items-baseline gap-y-1">
          {tokens.map((token, i) => {
            if (token.type === 'text') {
              return <span key={String(i)}>{token.text}</span>;
            }
            const idx = token.index ?? 0;
            const userAnswer = answers[idx] ?? '';
            const isCorrect = isRevealed &&
              userAnswer.trim().toLowerCase() === (token.answer ?? '').toLowerCase();
            return (
              <input
                key={String(i)}
                type="text"
                disabled={isRevealed}
                value={isRevealed ? (token.answer ?? '') : userAnswer}
                onChange={(e) => { setAnswers((prev) => ({ ...prev, [idx]: e.target.value })); }}
                aria-label={`Blank ${String(idx + 1)}`}
                className={`inline-block w-24 rounded border px-2 py-0.5 text-sm text-center mx-1 transition-colors outline-none
                  ${isRevealed && isCorrect ? 'border-dendrite-400 bg-dendrite-400/10' : ''}
                  ${isRevealed && !isCorrect ? 'border-cortex-400 bg-cortex-400/10' : ''}
                  ${!isRevealed ? 'border-border focus:border-synapse-400' : ''}`}
              />
            );
          })}
        </div>
        {!isRevealed && allFilled && (
          <button type="button" onClick={() => { onAnswer?.(answers); onReveal?.(); }}
            className="rounded-lg bg-synapse-400 text-white px-4 py-2 text-sm font-medium hover:bg-synapse-500 transition-colors">
            Check
          </button>
        )}
        {isRevealed && content.explanation !== undefined && (
          <p className="text-sm text-muted-foreground border-t pt-3">{content.explanation}</p>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 2: `matching.tsx`**

Click-to-match: click a left item, then click the matching right item. Items are shuffled for display.

```typescript
// apps/web/src/components/card-renderers/matching.tsx
'use client';
import type { IMatchingContent } from '@noema/api-client';
import { useMemo, useState } from 'react';
import { Card, CardContent } from '@noema/ui';
import type { ICardRendererProps } from './types.js';

export function MatchingRenderer({ card, mode, isRevealed, onAnswer, onReveal }: ICardRendererProps): React.JSX.Element {
  const content = card.content as IMatchingContent;
  // Shuffle right-side display order only (stable via useMemo with a fixed seed)
  const shuffledRight = useMemo(
    () => content.pairs.map((p, i) => ({ right: p.right, pairIndex: i })).reverse(),
    [content.pairs]
  );
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const [matched, setMatched] = useState<Record<number, number>>({}); // leftIdx -> pairIndex

  if (mode === 'preview') {
    return (
      <Card className="h-full">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Matching ({String(content.pairs.length)} pairs)</p>
          <p className="text-sm line-clamp-2">{content.front}</p>
        </CardContent>
      </Card>
    );
  }

  const handleLeftClick = (idx: number): void => {
    if (isRevealed || matched[idx] !== undefined) return;
    setSelectedLeft(selectedLeft === idx ? null : idx);
  };

  const handleRightClick = (pairIndex: number): void => {
    if (isRevealed || selectedLeft === null) return;
    const newMatched = { ...matched, [selectedLeft]: pairIndex };
    setMatched(newMatched);
    setSelectedLeft(null);
    if (Object.keys(newMatched).length === content.pairs.length) {
      onAnswer?.(newMatched);
      onReveal?.();
    }
  };

  return (
    <Card className="w-full">
      <CardContent className="p-6 space-y-4">
        <p className="text-base">{content.front}</p>
        <p className="text-xs text-muted-foreground">Click an item on the left, then its match on the right.</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            {content.pairs.map((pair, i) => {
              const isMatched = matched[i] !== undefined;
              const isCorrect = isRevealed && isMatched && matched[i] === i;
              return (
                <button key={String(i)} type="button" onClick={() => { handleLeftClick(i); }}
                  className={`w-full text-left rounded-lg border p-2 text-sm transition-colors
                    ${selectedLeft === i ? 'border-synapse-400 bg-synapse-400/10' : ''}
                    ${isCorrect ? 'border-dendrite-400 bg-dendrite-400/10' : ''}
                    ${isMatched && !isCorrect && isRevealed ? 'border-cortex-400 bg-cortex-400/10' : ''}
                    ${!isMatched && selectedLeft !== i ? 'border-border hover:border-synapse-400/30' : ''}`}>
                  {pair.left}
                </button>
              );
            })}
          </div>
          <div className="space-y-2">
            {shuffledRight.map(({ right, pairIndex }) => (
              <button key={String(pairIndex)} type="button" onClick={() => { handleRightClick(pairIndex); }}
                className="w-full text-left rounded-lg border border-border p-2 text-sm hover:border-axon-400/50 transition-colors">
                {right}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

**Step 3: `ordering.tsx`**

Native HTML5 drag-and-drop to reorder items.

```typescript
// apps/web/src/components/card-renderers/ordering.tsx
'use client';
import type { IOrderingContent } from '@noema/api-client';
import { useMemo, useState } from 'react';
import { Card, CardContent } from '@noema/ui';
import { GripVertical, CheckCircle2, XCircle } from 'lucide-react';
import type { ICardRendererProps } from './types.js';

export function OrderingRenderer({ card, mode, isRevealed, onAnswer, onReveal }: ICardRendererProps): React.JSX.Element {
  const content = card.content as IOrderingContent;
  const shuffled = useMemo(() => [...content.items].reverse(), [content.items]);
  const [order, setOrder] = useState(shuffled);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  if (mode === 'preview') {
    return (
      <Card className="h-full">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Order: {content.orderingCriterion}</p>
          <p className="text-sm">{String(content.items.length)} items</p>
        </CardContent>
      </Card>
    );
  }

  const moveItem = (from: number, to: number): void => {
    if (from === to) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    if (item !== undefined) next.splice(to, 0, item);
    setOrder(next);
  };

  return (
    <Card className="w-full">
      <CardContent className="p-6 space-y-4">
        <div>
          <p className="text-base">{content.front}</p>
          <p className="text-sm text-muted-foreground">Arrange: <em>{content.orderingCriterion}</em></p>
        </div>
        <div className="space-y-2">
          {order.map((item, i) => {
            const correct = isRevealed && item.correctPosition === i + 1;
            const wrong = isRevealed && item.correctPosition !== i + 1;
            return (
              <div key={item.text}
                draggable={!isRevealed}
                onDragStart={() => { setDraggingIdx(i); }}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={() => { if (draggingIdx !== null) { moveItem(draggingIdx, i); setDraggingIdx(null); } }}
                className={`flex items-center gap-3 rounded-lg border p-3 text-sm
                  ${correct ? 'border-dendrite-400 bg-dendrite-400/10' : ''}
                  ${wrong ? 'border-cortex-400 bg-cortex-400/10' : ''}
                  ${!isRevealed ? 'border-border cursor-grab' : ''}`}>
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1">{item.text}</span>
                {correct && <CheckCircle2 className="h-4 w-4 text-dendrite-400 shrink-0" />}
                {wrong && <XCircle className="h-4 w-4 text-cortex-400 shrink-0" />}
              </div>
            );
          })}
        </div>
        {!isRevealed && (
          <button type="button" onClick={() => { onAnswer?.(order.map((i) => i.text)); onReveal?.(); }}
            className="w-full rounded-lg bg-synapse-400 text-white py-2 text-sm font-medium">
            Check Order
          </button>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 4: `process.tsx`** — same drag pattern as `ordering.tsx` but for process steps. Steps have `title` + `description`; show only title while dragging, reveal full description on reveal. Wire `PROCESS` in RENDERER_MAP.

**Step 5: `timeline.tsx`** — same drag pattern. Events have `date` + `title`. Show date+title while dragging, reveal description on reveal. Wire `TIMELINE` in RENDERER_MAP.

**Step 6: `cause-effect.tsx`** — two-column click-to-link layout. Column A = causes, Column B = effects. Click a cause to select it, then click the matching effect to create a link (shown as coloured border). Submit when all relationships are linked. Reveal shows correct links with explanations.

**Step 7: Wire all 6 into index.tsx + commit**

```bash
git add apps/web/src/components/card-renderers/
git commit -m "feat(web): sequence renderers (cloze, matching, ordering, process, timeline, cause-effect)"
```

---

### Task 8: Standard Renderers Group C — Media Types

Types: IMAGE_OCCLUSION, AUDIO, DIAGRAM, MULTIMODAL

**Files:** One file per type + index update.

**`image-occlusion.tsx`** — renders the base image with an absolutely-positioned SVG layer. Each region is a `<rect>` or `<ellipse>` with `fill-synapse-400/60` overlay. Clicking a region removes its overlay and shows the label text as a `<text>` element in the SVG. In preview mode show a thumbnail with region count.

Key implementation note: Use `viewBox="0 0 100 100"` with `preserveAspectRatio="none"` on the SVG to map region coordinates (0-100 percentage) directly. The SVG is `position: absolute; inset: 0; width: 100%; height: 100%`.

**`audio-card.tsx`** — renders an `<audio>` element (hidden), a Play/Pause button wired to `audioRef.current.play()` / `.pause()`. Text response textarea below. Submitting triggers `onAnswer` + `onReveal`. Reveal shows `content.back` and an optional transcript disclosure.

Note: `<audio>` needs the `muted` attribute or `crossOrigin` may be needed depending on the audio source. Check browser autoplay policies.

**`diagram.tsx`** — renders the diagram image with numbered marker buttons at `(x%, y%)` positions using `position: absolute; transform: translate(-50%, -50%)`. Clicking a marker opens an inline input below the image. All markers must be answered before the Check button appears. Reveal replaces input values with correct answers and adds the label text.

**`multimodal.tsx`** — renders a list of media items sorted by `order`. Each item type renders differently: text = `<p>`, image = `<img>`, audio = `<audio controls>`, video = `<video controls>`. Shows `synthesisPrompt` as a question. Reveal shows `content.back`.

**Step: Commit**

```bash
git add apps/web/src/components/card-renderers/
git commit -m "feat(web): media renderers (image-occlusion, audio, diagram, multimodal)"
```

---

### Task 9: Standard Renderers Group D — Complex Reasoning Types

Types: COMPARISON, EXCEPTION, ERROR_SPOTTING, CONCEPT_GRAPH, CASE_BASED, TRANSFER, PROGRESSIVE_DISCLOSURE

**Files:** One file per type + index update.

**`comparison.tsx`** — data table: columns = items (by `label`), rows = `comparisonCriteria`. Cell content = `item.attributes[criterion]`. Preview shows item count. Interactive shows full table; no input needed (read-only comparison). Reveal is immediate — flip shows the table.

**`exception.tsx`** — shows `rule` in a highlighted box. Below it, exceptions list is hidden. User clicks "Show Exceptions" to reveal all `exceptions[].condition` + `explanation` pairs.

**`error-spotting.tsx`** — shows `errorText`. User clicks "Found It" to type the error location/description (free text). Reveal shows `correctedText` with the error location described by `errorType` and `errorExplanation`.

**`concept-graph.tsx`** — mini force-directed SVG (reuse the layout from `knowledge-pulse.tsx`). In interactive mode, render nodes with labels hidden (blank circles). User clicks a node to type its label. Reveal shows all correct labels. Use the `computeForceLayout` function copied from `knowledge-pulse.tsx`.

**`case-based.tsx`** — renders scenario + question. If `options` present, renders like MultipleChoiceRenderer. If no options, free text textarea. Reveal shows correct option (if applicable) + `analysis`.

**`transfer.tsx`** — shows `originalContext` in a "Context" box, `transferPrompt` as the question. User types free-text response. Reveal shows `novelContext` + `structuralMapping`.

**`progressive-disclosure.tsx`** — shows `layers[0].content` initially. A "Next" button appears below to reveal the next layer. Layers accumulate (don't replace). No `onAnswer` — just sequential revelation.

**Step: Commit**

```bash
git add apps/web/src/components/card-renderers/
git commit -m "feat(web): complex reasoning renderers (comparison, exception, error-spotting, concept-graph, case-based, transfer, progressive-disclosure)"
```

---

### Task 10: Remediation Renderers Group A — Comparison / Boundary Types

Types: CONTRASTIVE_PAIR, MINIMAL_PAIR, FALSE_FRIEND, OLD_VS_NEW_DEFINITION, BOUNDARY_CASE, RULE_SCOPE, DISCRIMINANT_FEATURE

All 7 are essentially comparison/display renderers with no complex interaction.

**`contrastive-pair.tsx`** — `sharedContext` at top in a muted box. Two columns: Item A (left) vs Item B (right). Below: `keyDifferences` as a bulleted list.

**`minimal-pair.tsx`** — two items side-by-side with the `discriminatingFeature` highlighted in a synapse-400 badge between them.

**`false-friend.tsx`** — shows termA and termB in large font. Arrow between them labeled "NOT the same". `actualMeaning` below. `domainContext` as subtext.

**`old-vs-new-definition.tsx`** — before/after split panel. Old definition has a strikethrough-style warning icon. New definition has a check icon. `changeReason` below.

**`boundary-case.tsx`** — shows `concept` and `boundaryCondition`. True/False buttons ("Inside?" / "Outside?"). Reveal shows `isIncluded` result + `reasoning`.

**`rule-scope.tsx`** — shows `rule` at top. Below: two columns — "Applies when" (checkmark list) and "Does NOT apply when" (X list).

**`discriminant-feature.tsx`** — table with Feature / Value / Diagnostic columns. Diagnostic features highlighted with a star badge.

```bash
git add apps/web/src/components/card-renderers/
git commit -m "feat(web): remediation renderers group A (7 comparison/boundary types)"
```

---

### Task 11: Remediation Renderers Group B — Metacognitive Types

Types: ASSUMPTION_CHECK, COUNTEREXAMPLE, REPRESENTATION_SWITCH, RETRIEVAL_CUE, ENCODING_REPAIR, OVERWRITE_DRILL

**`assumption-check.tsx`** — shows `statement`. User types the hidden assumption. Reveal shows `hiddenAssumption` + `consequence`.

**`counterexample.tsx`** — shows `claim`. User types a counterexample. Reveal shows `counterexample` + `significance`.

**`representation-switch.tsx`** — shows `representations[0]` (first rep). Tabs or buttons to switch between all representations. Each tab shows one representation type and its content.

**`retrieval-cue.tsx`** — shows `target`. For each cue in `cues`, user rates effectiveness (strong/moderate/weak radio). Reveal shows the actual `effectiveness` rating with explanation.

**`encoding-repair.tsx`** — shows `concept` + `incorrectEncoding` in a warning box ("Common mistake"). User types the correct encoding. Reveal shows `correctEncoding` + `repairStrategy`.

**`overwrite-drill.tsx`** — shows `incorrectResponse` in a red-tinted box ("Common trap"). User types the correct response. Checks against `correctResponse`. Cycles through `drillPrompts` for reinforcement.

```bash
git add apps/web/src/components/card-renderers/
git commit -m "feat(web): remediation renderers group B (6 metacognitive types)"
```

---

### Task 12: Remediation Renderers Group C — Bias Correction Types

Types: AVAILABILITY_BIAS_DISCONFIRMATION, SELF_CHECK_RITUAL, CALIBRATION_TRAINING, ATTRIBUTION_REFRAMING, STRATEGY_REMINDER, CONFUSABLE_SET_DRILL, PARTIAL_KNOWLEDGE_DECOMPOSITION

**`availability-bias-disconfirmation.tsx`** — shows `biasedBelief` in a yellow warning box. User confirms "This is what I might intuitively think". Reveal shows `evidence` + optional `baseRate` + `biasExplanation`.

**`self-check-ritual.tsx`** — shows `concept` + `trigger`. Steps rendered as a checklist. User checks each `checkStep.question` off sequentially before submitting.

**`calibration-training.tsx`** — shows `statement`. Slider (0–100%) for confidence input. Submit. Reveal shows `trueConfidence` vs user's confidence with delta and `calibrationPrompt`.

**`attribution-reframing.tsx`** — shows `outcome` + `emotionalAttribution` in an orange box ("Unhelpful framing"). User clicks "Reframe It". Reveal shows `processAttribution` in a green box ("Helpful framing").

**`strategy-reminder.tsx`** — shows `strategy` + `whenToUse` context. User confirms understanding. Reveal shows `whenNotToUse` + `exampleApplication`.

**`confusable-set-drill.tsx`** — cycles through all `items` one at a time. Shows `term` only, user types `distinguishingFeature`. Reveal shows correct. Progress indicator `n / total`. Shows `confusionPattern` at end.

**`partial-knowledge-decomposition.tsx`** — shows `concept`. Below: `knownParts` pre-filled as checked items. `unknownParts` shown as unchecked. User reflects on which gaps to address. No wrong answers — reflection exercise.

**Step: Final verification**

After Task 12, verify all 42 RENDERER_MAP entries point to real components:

```bash
# Grep to confirm no FallbackRenderer left in RENDERER_MAP
grep 'FallbackRenderer' apps/web/src/components/card-renderers/index.tsx
# Expected: only the import line and the default fallback in the CardRenderer function
# None of the 42 RENDERER_MAP entries should still use FallbackRenderer

cd apps/web && pnpm tsc --noEmit 2>&1 | grep error | wc -l
# Expected: 0
```

```bash
git add apps/web/src/components/card-renderers/
git commit -m "feat(web): remediation renderers group C (7 bias correction types) — all 42 card types implemented"
```
