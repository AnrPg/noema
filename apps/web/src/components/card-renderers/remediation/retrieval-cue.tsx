'use client';

/**
 * @noema/web - Card Renderers
 * RetrievalCueRenderer — practice retrieving a target using provided cues; includes a recall prompt.
 */

import * as React from 'react';
import type { IRetrievalCueContent } from '@noema/api-client';
import { Button } from '@noema/ui';
import { CardShell } from '../card-shell.js';
import type { ICardRendererProps } from '../types.js';

const EFFECTIVENESS_COLOR: Record<string, string> = {
  strong: 'text-green-400',
  moderate: 'text-amber-400',
  weak: 'text-muted-foreground',
};

const EFFECTIVENESS_BG: Record<string, string> = {
  strong: 'bg-green-500/10 border-green-500/30',
  moderate: 'bg-amber-500/10 border-amber-500/30',
  weak: 'bg-muted/20 border-border',
};

export default function RetrievalCueRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode } = props;
  const content = card.content as unknown as IRetrievalCueContent;

  const [recall, setRecall] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    setRecall('');
    setSubmitted(false);
  }, [card.id]);

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="font-medium line-clamp-1">{content.target}</span>
        <span className="text-muted-foreground text-xs ml-1">
          · {String(content.cues.length)} cue{content.cues.length !== 1 ? 's' : ''}
        </span>
      </CardShell>
    );
  }

  function handleSubmit(): void {
    setSubmitted(true);
    props.onAnswer?.(recall);
  }

  const actionSlot = (
    <div className="space-y-4">
      {/* Context */}
      {content.context !== undefined && content.context !== '' && (
        <div className="rounded border border-border bg-muted/30 p-3 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Context
          </p>
          <p className="text-sm text-foreground">{content.context}</p>
        </div>
      )}

      {/* Cues */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Retrieval Cues
        </p>
        {content.cues.map((cue, idx) => {
          const colorClass = EFFECTIVENESS_COLOR[cue.effectiveness] ?? 'text-muted-foreground';
          const bgClass = EFFECTIVENESS_BG[cue.effectiveness] ?? 'bg-muted/20 border-border';
          return (
            <div key={idx} className={`rounded border p-2.5 flex items-start gap-2 ${bgClass}`}>
              <span className={`text-xs font-semibold uppercase mt-0.5 shrink-0 ${colorClass}`}>
                {cue.effectiveness}
              </span>
              <p className="text-sm text-foreground">{cue.cue}</p>
            </div>
          );
        })}
        {content.cues.length === 0 && (
          <p className="text-sm text-muted-foreground italic">No cues provided.</p>
        )}
      </div>

      {/* Recall textarea */}
      {!props.isRevealed && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Your Recall
          </p>
          <textarea
            value={recall}
            onChange={(e) => {
              if (!submitted) setRecall(e.target.value);
            }}
            disabled={submitted}
            placeholder="Type what you can recall about the target…"
            aria-label="Recall attempt"
            rows={3}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-synapse-400 disabled:opacity-60 resize-none"
          />
          {!submitted && (
            <Button
              size="sm"
              disabled={recall.trim() === ''}
              onClick={handleSubmit}
              aria-label="Submit recall attempt"
            >
              Submit
            </Button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <CardShell
      {...props}
      {...(content.hint !== undefined ? { hint: content.hint } : {})}
      actions={actionSlot}
    >
      <div className="space-y-3">
        {/* Target */}
        <div className="rounded border border-synapse-500/30 bg-synapse-500/5 p-3 space-y-1">
          <p className="text-xs font-semibold text-synapse-400 uppercase tracking-wide">Target</p>
          <p className="text-base font-medium text-foreground">{content.target}</p>
        </div>

        {content.explanation !== undefined && content.explanation !== '' && (
          <p className="text-sm text-muted-foreground border-t border-border pt-3">
            {content.explanation}
          </p>
        )}
      </div>
    </CardShell>
  );
}
