'use client';

/**
 * @noema/web - Card Renderers
 * DiagramRenderer — annotated diagram/image with label overlay and reveal.
 */

import * as React from 'react';
import type { IDiagramContent, IDiagramLabel } from '@noema/api-client';
import { CardShell } from './card-shell';
import type { ICardRendererProps } from './types';

export default function DiagramRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode, isRevealed } = props;
  const content = card.content as unknown as IDiagramContent;

  const [imgLoaded, setImgLoaded] = React.useState(false);
  const [imgError, setImgError] = React.useState(false);

  React.useEffect(() => {
    setImgLoaded(false);
    setImgError(false);
  }, [card.id]);

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="font-medium">
          {content.diagramType !== undefined && content.diagramType !== ''
            ? content.diagramType
            : 'Diagram'}
        </span>
        {content.labels.length > 0 && (
          <span className="text-xs text-muted-foreground ml-1">
            · {String(content.labels.length)} labels
          </span>
        )}
        {content.imageUrl !== '' && (
          <img
            src={content.imageUrl}
            alt="Diagram preview"
            className="mt-1 rounded max-h-16 object-contain"
            onError={() => {
              /* silently hide */
            }}
          />
        )}
      </CardShell>
    );
  }

  // Interactive mode: image with label pin markers; on reveal show descriptions
  const actionSlot = (
    <div className="space-y-3">
      {content.diagramType !== undefined && content.diagramType !== '' && (
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {content.diagramType}
        </p>
      )}

      {content.front !== undefined && content.front !== '' && (
        <p className="text-base font-medium text-foreground">{content.front}</p>
      )}

      <div className="relative inline-block w-full">
        {!imgError && content.imageUrl !== '' ? (
          <>
            <img
              src={content.imageUrl}
              alt={
                content.diagramType !== undefined && content.diagramType !== ''
                  ? content.diagramType
                  : 'Diagram'
              }
              className="w-full rounded object-contain"
              onLoad={() => {
                setImgLoaded(true);
              }}
              onError={() => {
                setImgError(true);
              }}
            />
            {/* Label pin markers positioned as % of image */}
            {imgLoaded &&
              content.labels.map((label: IDiagramLabel, idx: number) => (
                <div
                  key={`${String(label.x)}-${String(label.y)}`}
                  style={{
                    position: 'absolute',
                    left: `${String(label.x)}%`,
                    top: `${String(label.y)}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  {/* Pin dot */}
                  <div
                    className="w-5 h-5 rounded-full bg-synapse-500 border-2 border-white shadow flex items-center justify-center text-white text-xs font-bold cursor-default"
                    aria-label={`Label ${String(idx + 1)}: ${label.text}`}
                  >
                    {String(idx + 1)}
                  </div>
                  {/* Show text label on hover or when revealed */}
                  {isRevealed && (
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 bg-popover text-popover-foreground text-xs font-medium px-2 py-1 rounded shadow border border-border whitespace-nowrap z-10">
                      {label.text}
                    </div>
                  )}
                </div>
              ))}
          </>
        ) : (
          <div className="flex items-center justify-center h-32 rounded border border-dashed border-border text-muted-foreground text-sm">
            {imgError ? 'Image failed to load' : 'Image unavailable'}
          </div>
        )}
      </div>

      {content.labels.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {String(content.labels.length)} label{content.labels.length !== 1 ? 's' : ''} —{' '}
          {isRevealed ? 'hover the pin to see full text' : 'reveal to see labels'}
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
      {/* Revealed: show full label list with answers */}
      <div className="space-y-2">
        {content.labels.map((label: IDiagramLabel, idx: number) => (
          <div key={`${String(label.x)}-${String(label.y)}`} className="flex gap-3 items-start">
            <span className="w-5 h-5 rounded-full bg-synapse-500/20 text-synapse-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
              {String(idx + 1)}
            </span>
            <div className="flex-1">
              <span className="text-sm font-medium text-foreground">{label.text}</span>
              {label.answer !== '' && (
                <p className="text-xs text-muted-foreground mt-0.5">{label.answer}</p>
              )}
            </div>
          </div>
        ))}
      </div>
      {content.explanation !== undefined && content.explanation !== '' && (
        <p className="text-sm text-muted-foreground mt-2">{content.explanation}</p>
      )}
    </CardShell>
  );
}
