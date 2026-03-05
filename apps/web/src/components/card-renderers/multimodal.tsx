'use client';

/**
 * @noema/web - Card Renderers
 * MultimodalRenderer — mixed media card (text + image + audio + video elements).
 */

import * as React from 'react';
import type { IMultimodalContent, IMultimodalItem } from '@noema/api-client';
import { CardShell } from './card-shell.js';
import type { ICardRendererProps } from './types.js';

/** Render a single multimodal item element. */
function MultimodalItemView({
  item,
  index,
  imgError,
  onImgError,
  audioRefCallback,
}: {
  item: IMultimodalItem;
  index: number;
  imgError: boolean;
  onImgError: () => void;
  audioRefCallback: (el: HTMLAudioElement | null) => void;
}): React.JSX.Element {
  switch (item.type) {
    case 'image':
      if (imgError) {
        return (
          <div className="space-y-1">
            <span className="block text-sm text-muted-foreground italic">Image unavailable</span>
          </div>
        );
      }
      return (
        <div className="space-y-1">
          <img
            src={item.content}
            alt={
              item.description !== undefined && item.description !== ''
                ? item.description
                : `Image ${String(index + 1)}`
            }
            className="w-full rounded object-contain max-h-64"
            onError={onImgError}
          />
          {item.description !== undefined && item.description !== '' && (
            <p className="text-xs text-muted-foreground italic">{item.description}</p>
          )}
        </div>
      );

    case 'audio':
      return (
        <div className="space-y-1">
          {item.description !== undefined && item.description !== '' && (
            <p className="text-xs text-muted-foreground">{item.description}</p>
          )}
          <div className="rounded border border-border bg-muted/30 p-3">
            <audio
              ref={audioRefCallback}
              controls
              className="w-full"
              aria-label={item.description ?? `Audio ${String(index + 1)}`}
            >
              <source src={item.content} />
              Your browser does not support the audio element.
            </audio>
          </div>
        </div>
      );

    case 'video':
      return (
        <div className="space-y-1">
          {item.description !== undefined && item.description !== '' && (
            <p className="text-xs text-muted-foreground">{item.description}</p>
          )}
          <div className="rounded border border-border bg-muted/30 p-2">
            <video
              controls
              className="w-full rounded max-h-64"
              aria-label={item.description ?? `Video ${String(index + 1)}`}
            >
              <source src={item.content} />
              Your browser does not support the video element.
            </video>
          </div>
        </div>
      );

    case 'text':
    default:
      return <p className="text-sm text-foreground leading-relaxed">{item.content}</p>;
  }
}

export default function MultimodalRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode, isRevealed } = props;
  const content = card.content as unknown as IMultimodalContent;

  const [imgErrors, setImgErrors] = React.useState<Set<number>>(new Set());
  const audioRefs = React.useRef<Map<number, HTMLAudioElement>>(new Map());

  // Sort items by optional order field if present
  const sortedItems = React.useMemo(() => {
    return [...content.mediaItems].sort((a, b) => {
      const aOrder = a.order ?? 0;
      const bOrder = b.order ?? 0;
      return aOrder - bOrder;
    });
  }, [content.mediaItems]);

  React.useEffect(() => {
    audioRefs.current.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    setImgErrors(new Set());
  }, [card.id]);

  if (mode === 'preview') {
    // Show first text item as summary, or generic label
    const firstText = sortedItems.find((item) => item.type === 'text');
    return (
      <CardShell {...props}>
        <span className="text-sm text-muted-foreground line-clamp-2">
          {firstText !== undefined
            ? firstText.content
            : content.synthesisPrompt !== undefined && content.synthesisPrompt !== ''
              ? content.synthesisPrompt
              : `Multimodal · ${String(sortedItems.length)} element${sortedItems.length !== 1 ? 's' : ''}`}
        </span>
      </CardShell>
    );
  }

  const actionSlot = (
    <div className="space-y-4">
      {content.synthesisPrompt !== undefined && content.synthesisPrompt !== '' && (
        <p className="text-base font-medium text-foreground">{content.synthesisPrompt}</p>
      )}

      {content.front !== undefined && content.front !== '' && (
        <p className="text-base font-medium text-foreground">{content.front}</p>
      )}

      <div className="space-y-4">
        {sortedItems.map((item, idx) => (
          <MultimodalItemView
            key={idx}
            item={item}
            index={idx}
            imgError={imgErrors.has(idx)}
            onImgError={() => {
              setImgErrors((prev) => new Set(prev).add(idx));
            }}
            audioRefCallback={(el) => {
              if (el !== null) {
                audioRefs.current.set(idx, el);
              } else {
                audioRefs.current.delete(idx);
              }
            }}
          />
        ))}
      </div>

      {sortedItems.length === 0 && (
        <p className="text-sm text-muted-foreground italic">No media elements</p>
      )}
    </div>
  );

  return (
    <CardShell
      {...props}
      {...(content.hint !== undefined ? { hint: content.hint } : {})}
      actions={actionSlot}
    >
      {content.back !== undefined && content.back !== '' && (
        <p className="text-base font-medium text-foreground">{content.back}</p>
      )}
      {content.explanation !== undefined && content.explanation !== '' && (
        <p className="text-sm text-muted-foreground">{content.explanation}</p>
      )}
      {/* isRevealed guard — extra info only after reveal */}
      {isRevealed &&
        (content.back === undefined || content.back === '') &&
        (content.explanation === undefined || content.explanation === '') && (
          <p className="text-sm text-muted-foreground italic">No additional answer provided.</p>
        )}
    </CardShell>
  );
}
