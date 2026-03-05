'use client';

/**
 * @noema/web - Card Renderers
 * ImageOcclusionRenderer — image with hidden regions that reveal on answer.
 */

import * as React from 'react';
import type { IImageOcclusionContent, IOcclusionRegion } from '@noema/api-client';
import { CardShell } from './card-shell.js';
import type { ICardRendererProps } from './types.js';

export default function ImageOcclusionRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode, isRevealed } = props;
  const content = card.content as unknown as IImageOcclusionContent;

  const [imgSize, setImgSize] = React.useState<{ width: number; height: number } | null>(null);
  const imgRef = React.useRef<HTMLImageElement>(null);

  React.useEffect(() => {
    setImgSize(null);
  }, [card.id]);

  function handleImgLoad(): void {
    if (imgRef.current !== null) {
      setImgSize({
        width: imgRef.current.naturalWidth,
        height: imgRef.current.naturalHeight,
      });
    }
  }

  function handleImgError(): void {
    // Silently clear size on error so the placeholder is shown
    setImgSize(null);
  }

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        {content.imageUrl !== '' ? (
          <img
            src={content.imageUrl}
            alt="Image occlusion preview"
            className="rounded max-h-20 object-contain"
            onError={handleImgError}
          />
        ) : (
          <span className="text-muted-foreground italic">Image Occlusion</span>
        )}
        {content.regions.length > 0 && (
          <span className="text-xs text-muted-foreground ml-1">
            · {String(content.regions.length)} regions
          </span>
        )}
      </CardShell>
    );
  }

  // Interactive mode: show the image with occlusion overlays; on reveal, remove overlays and show labels
  const actionSlot = (
    <div className="space-y-3">
      {content.front !== undefined && content.front !== '' && (
        <p className="text-base font-medium text-foreground">{content.front}</p>
      )}
      <p className="text-xs text-muted-foreground">
        {isRevealed
          ? 'All regions revealed'
          : `${String(content.regions.length)} region${content.regions.length !== 1 ? 's' : ''} hidden — reveal to see labels`}
      </p>
      <div className="relative inline-block w-full">
        {content.imageUrl !== '' ? (
          <>
            <img
              ref={imgRef}
              src={content.imageUrl}
              alt="Occlusion diagram"
              className="w-full rounded object-contain"
              onLoad={handleImgLoad}
              onError={handleImgError}
            />
            {/* Occlusion overlays — positioned as % of rendered image size */}
            {!isRevealed &&
              imgSize !== null &&
              content.regions.map((region: IOcclusionRegion) => (
                <div
                  key={region.id}
                  aria-label={`Occluded region: ${region.label}`}
                  style={{
                    position: 'absolute',
                    left: `${String(region.x)}%`,
                    top: `${String(region.y)}%`,
                    width: `${String(region.width)}%`,
                    height: `${String(region.height)}%`,
                    backgroundColor: 'rgba(100, 116, 139, 0.85)',
                    borderRadius: region.shape === 'ellipse' ? '50%' : '4px',
                    border: '2px solid rgba(100,116,139,0.5)',
                    cursor: 'default',
                  }}
                />
              ))}
            {/* Revealed: show label badges */}
            {isRevealed &&
              imgSize !== null &&
              content.regions.map((region: IOcclusionRegion) => (
                <div
                  key={region.id}
                  style={{
                    position: 'absolute',
                    left: `${String(region.x)}%`,
                    top: `${String(region.y)}%`,
                    width: `${String(region.width)}%`,
                    height: `${String(region.height)}%`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span className="bg-synapse-500/90 text-white text-xs font-semibold px-1.5 py-0.5 rounded shadow pointer-events-none">
                    {region.label}
                  </span>
                </div>
              ))}
          </>
        ) : (
          <div className="flex items-center justify-center h-32 rounded border border-dashed border-border text-muted-foreground text-sm">
            Image unavailable
          </div>
        )}
      </div>
    </div>
  );

  return (
    <CardShell
      {...props}
      {...(content.hint !== undefined ? { hint: content.hint } : {})}
      actions={actionSlot}
    >
      {content.back !== undefined && content.back !== '' && (
        <p className="text-sm text-foreground">{content.back}</p>
      )}
      {content.explanation !== undefined && content.explanation !== '' && (
        <p className="text-sm text-muted-foreground">{content.explanation}</p>
      )}
    </CardShell>
  );
}
