'use client';

/**
 * @noema/web - Card Renderers
 * ProgressiveDisclosureRenderer — layered information reveal, one layer at a time.
 */

import * as React from 'react';
import type { IProgressiveDisclosureContent } from '@noema/api-client';
import { Button, cn } from '@noema/ui';
import { CardShell } from './card-shell.js';
import type { ICardRendererProps } from './types.js';

export default function ProgressiveDisclosureRenderer(
  props: ICardRendererProps
): React.JSX.Element {
  const { card, mode, isRevealed } = props;
  const content = card.content as unknown as IProgressiveDisclosureContent;

  const sortedLayers = React.useMemo(
    () => [...content.layers].sort((a, b) => a.order - b.order),
    [content.layers]
  );

  const [currentLayer, setCurrentLayer] = React.useState(0);

  React.useEffect(() => {
    setCurrentLayer(0);
  }, [card.id]);

  if (mode === 'preview') {
    const firstLayer = sortedLayers[0];
    return (
      <CardShell {...props}>
        <span className="line-clamp-2">
          {firstLayer !== undefined ? firstLayer.content : 'Progressive Disclosure'}
        </span>
        <span className="text-muted-foreground text-xs ml-1">
          · {String(sortedLayers.length)} layer{sortedLayers.length !== 1 ? 's' : ''}
        </span>
      </CardShell>
    );
  }

  // When isRevealed all layers are shown; otherwise show up to currentLayer index (inclusive)
  const visibleCount = isRevealed ? sortedLayers.length : currentLayer + 1;
  const visibleLayers = sortedLayers.slice(0, visibleCount);
  const hasMore = !isRevealed && currentLayer < sortedLayers.length - 1;

  function advanceLayer(): void {
    setCurrentLayer((prev) => Math.min(prev + 1, sortedLayers.length - 1));
  }

  const actionSlot = (
    <div className="space-y-3">
      {content.front !== undefined && content.front !== '' && (
        <p className="text-base font-medium text-foreground">{content.front}</p>
      )}

      {/* Layer progress indicator */}
      <div className="flex items-center gap-1">
        {sortedLayers.map((_, idx) => (
          <div
            key={idx}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              idx < visibleCount ? 'bg-synapse-400' : 'bg-muted/40'
            )}
            aria-hidden="true"
          />
        ))}
        <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
          {String(visibleCount)} / {String(sortedLayers.length)}
        </span>
      </div>

      {/* Visible layers */}
      <div className="space-y-3">
        {visibleLayers.map((layer, idx) => (
          <div
            key={layer.order}
            className={cn(
              'rounded border p-3 space-y-1 transition-all',
              idx === visibleLayers.length - 1 && !isRevealed
                ? 'border-synapse-400/40 bg-synapse-400/5'
                : 'border-border bg-muted/20'
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="w-5 h-5 rounded-full bg-synapse-400/20 text-synapse-600 text-xs font-bold flex items-center justify-center flex-shrink-0">
                {String(layer.order)}
              </span>
              {layer.revealCondition !== undefined && layer.revealCondition !== '' && (
                <span className="text-xs text-muted-foreground italic">
                  {layer.revealCondition}
                </span>
              )}
            </div>
            <p className="text-sm text-foreground leading-relaxed">{layer.content}</p>
          </div>
        ))}
      </div>

      {/* Next layer button */}
      {hasMore && (
        <Button
          variant="outline"
          size="sm"
          onClick={advanceLayer}
          aria-label={`Reveal layer ${String(currentLayer + 2)} of ${String(sortedLayers.length)}`}
        >
          Next Layer ▼
        </Button>
      )}

      {!hasMore && !isRevealed && sortedLayers.length > 0 && (
        <p className="text-xs text-muted-foreground italic">
          All layers revealed — flip to complete.
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
      {/* Revealed: summary / explanation */}
      <div className="space-y-2">
        {content.back !== undefined && content.back !== '' && (
          <p className="text-sm text-foreground leading-relaxed">{content.back}</p>
        )}
        {content.explanation !== undefined && content.explanation !== '' && (
          <p className="text-sm text-muted-foreground">{content.explanation}</p>
        )}
        {(content.back === undefined || content.back === '') &&
          (content.explanation === undefined || content.explanation === '') && (
            <p className="text-sm text-muted-foreground italic">
              {String(sortedLayers.length)} layer{sortedLayers.length !== 1 ? 's' : ''} complete.
            </p>
          )}
      </div>
    </CardShell>
  );
}
