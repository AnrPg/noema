'use client';

/**
 * @noema/web - Card Renderers
 * AudioCardRenderer — listen-and-recall card with native audio playback.
 * Named audio-card.tsx to avoid conflict with the HTML <audio> element global.
 */

import * as React from 'react';
import type { IAudioContent } from '@noema/api-client';
import { CardShell } from './card-shell';
import type { ICardRendererProps } from './types';

export default function AudioCardRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode } = props;
  const content = card.content as unknown as IAudioContent;

  // Reset audio element state when card changes
  const audioRef = React.useRef<HTMLAudioElement>(null);

  React.useEffect(() => {
    if (audioRef.current !== null) {
      audioRef.current.pause();
      audioRef.current.load();
    }
  }, [card.id]);

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        {/* Speaker icon via unicode */}
        <span className="mr-1" aria-hidden="true">
          🔊
        </span>
        <span className="text-sm text-muted-foreground">
          {content.front !== undefined && content.front !== ''
            ? content.front
            : content.transcript !== undefined && content.transcript !== ''
              ? content.transcript
              : 'Audio card'}
        </span>
      </CardShell>
    );
  }

  // Build audio src — honour optional startTime/endTime via media fragments if supported
  const audioSrc = (() => {
    let src = content.audioUrl;
    if (
      (content.startTime !== undefined && content.startTime > 0) ||
      content.endTime !== undefined
    ) {
      const start = content.startTime !== undefined ? String(content.startTime) : '0';
      const end = content.endTime !== undefined ? `,${String(content.endTime)}` : '';
      src = `${src}#t=${start}${end}`;
    }
    return src;
  })();

  const actionSlot = (
    <div className="space-y-4">
      {content.front !== undefined && content.front !== '' && (
        <p className="text-base font-medium text-foreground">{content.front}</p>
      )}

      {/* Native audio player */}
      <div className="rounded border border-border bg-muted/30 p-3">
        <audio
          ref={audioRef}
          controls
          className="w-full"
          aria-label="Card audio"
          {...(content.playbackSpeed !== undefined && content.playbackSpeed !== 1
            ? {
                onCanPlay: () => {
                  if (audioRef.current !== null) {
                    audioRef.current.playbackRate = content.playbackSpeed ?? 1;
                  }
                },
              }
            : {})}
        >
          <source src={audioSrc} />
          Your browser does not support the audio element.
        </audio>
      </div>

      {content.playbackSpeed !== undefined && content.playbackSpeed !== 1 && (
        <p className="text-xs text-muted-foreground">
          Playback speed: {String(content.playbackSpeed)}×
        </p>
      )}
    </div>
  );

  return (
    <CardShell
      {...props}
      {...(content.hint !== undefined ? { hint: content.hint } : {})}
      actions={actionSlot}
    >
      {/* Revealed: show transcript and back */}
      {content.back !== undefined && content.back !== '' && (
        <p className="text-base font-medium text-foreground">{content.back}</p>
      )}
      {content.transcript !== undefined && content.transcript !== '' && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Transcript
          </p>
          <p className="text-sm text-foreground">{content.transcript}</p>
        </div>
      )}
      {content.explanation !== undefined && content.explanation !== '' && (
        <p className="text-sm text-muted-foreground">{content.explanation}</p>
      )}
    </CardShell>
  );
}
