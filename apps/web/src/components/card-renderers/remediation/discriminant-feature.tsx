'use client';

/**
 * @noema/web - Card Renderers
 * DiscriminantFeatureRenderer — features of a concept, highlighting which are diagnostic.
 */

import * as React from 'react';
import type { IDiscriminantFeatureContent } from '@noema/api-client';
import { cn } from '@noema/ui';
import { CardShell } from '../card-shell.js';
import type { ICardRendererProps } from '../types.js';

export default function DiscriminantFeatureRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode } = props;
  const content = card.content as unknown as IDiscriminantFeatureContent;

  const diagnosticCount = content.features.filter((f) => f.diagnostic).length;

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="font-medium line-clamp-1">{content.concept}</span>
        <span className="text-muted-foreground text-xs ml-1">
          · {String(diagnosticCount)} diagnostic feature{diagnosticCount !== 1 ? 's' : ''}
        </span>
      </CardShell>
    );
  }

  const actionSlot = (
    <div className="space-y-4">
      {/* Concept */}
      <div className="rounded border border-border bg-muted/30 p-3 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Concept
        </p>
        <p className="text-base font-medium text-foreground">{content.concept}</p>
      </div>

      {!props.isRevealed && (
        <p className="text-sm text-muted-foreground italic">
          Which features are truly diagnostic (essential) vs incidental? Reveal to see all{' '}
          {String(content.features.length)} features with their diagnostic status.
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
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Features
        </p>
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Feature</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Value</th>
                <th className="px-3 py-2 text-center font-semibold text-muted-foreground">
                  Diagnostic?
                </th>
              </tr>
            </thead>
            <tbody>
              {content.features.map((feature, idx) => (
                <tr
                  key={feature.name}
                  className={cn(
                    'border-b border-border last:border-0',
                    idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                  )}
                >
                  <td className="px-3 py-2 font-medium text-foreground">{feature.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{feature.value}</td>
                  <td className="px-3 py-2 text-center">
                    {feature.diagnostic ? (
                      <span className="inline-block rounded px-1.5 py-0.5 text-xs font-semibold bg-synapse-500/20 text-synapse-400">
                        Yes
                      </span>
                    ) : (
                      <span className="inline-block rounded px-1.5 py-0.5 text-xs font-semibold bg-muted/40 text-muted-foreground">
                        No
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {content.features.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground italic">
                    No features defined.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
