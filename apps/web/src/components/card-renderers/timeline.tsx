'use client';

/**
 * @noema/web - Card Renderers
 * TimelineRenderer — chronological events displayed as a vertical timeline.
 */

import * as React from 'react';
import type { ITimelineContent } from '@noema/api-client';
import { CardShell } from './card-shell.js';
import type { ICardRendererProps } from './types.js';

export default function TimelineRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode } = props;
  const content = card.content as unknown as ITimelineContent;

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="text-muted-foreground">
          Timeline: {String(content.events.length)} events
        </span>
        {content.timelineScope !== undefined && content.timelineScope !== '' && (
          <span className="ml-1 text-xs text-muted-foreground">({content.timelineScope})</span>
        )}
      </CardShell>
    );
  }

  const timelineContent = (
    <div className="space-y-3">
      {content.timelineScope !== undefined && content.timelineScope !== '' && (
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {content.timelineScope}
        </p>
      )}
      <div className="relative pl-4">
        {/* Vertical line */}
        <div className="absolute left-1.5 top-2 bottom-2 w-px bg-border" />
        <div className="space-y-4">
          {content.events.map((event, i) => (
            <div key={i} className="relative flex gap-4">
              {/* Dot */}
              <div className="absolute -left-2.5 top-1 w-3 h-3 rounded-full border-2 border-synapse-400 bg-background flex-shrink-0" />
              <div className="pl-2 flex-1">
                <span className="text-xs font-mono text-synapse-600 font-semibold">
                  {event.date}
                </span>
                <p className="text-sm font-medium text-foreground mt-0.5">{event.title}</p>
                {event.description !== undefined && event.description !== '' && (
                  <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const actionSlot = (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">
        {String(content.events.length)} events in chronological order
      </p>
      {timelineContent}
    </div>
  );

  return (
    <CardShell
      {...props}
      {...(content.hint !== undefined ? { hint: content.hint } : {})}
      actions={actionSlot}
    >
      {content.explanation !== undefined && content.explanation !== '' && (
        <p className="text-sm text-muted-foreground">{content.explanation}</p>
      )}
    </CardShell>
  );
}
