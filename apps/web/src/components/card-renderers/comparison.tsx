'use client';

/**
 * @noema/web - Card Renderers
 * ComparisonRenderer — compare multiple concepts across shared criteria.
 */

import * as React from 'react';
import type { IComparisonContent } from '@noema/api-client';
import { cn } from '@noema/ui';
import { CardShell } from './card-shell.js';
import type { ICardRendererProps } from './types.js';

export default function ComparisonRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode } = props;
  const content = card.content as unknown as IComparisonContent;

  if (mode === 'preview') {
    const labels = content.items.map((item) => item.label).join(' vs ');
    return (
      <CardShell {...props}>
        <span className="font-medium line-clamp-1">{labels !== '' ? labels : 'Comparison'}</span>
        {content.comparisonCriteria !== undefined && content.comparisonCriteria.length > 0 && (
          <span className="text-muted-foreground text-xs ml-1">
            · {String(content.comparisonCriteria.length)} criteria
          </span>
        )}
      </CardShell>
    );
  }

  // Collect all attribute keys across all items, using comparisonCriteria as the preferred order
  const allKeys = React.useMemo(() => {
    const fromCriteria = content.comparisonCriteria ?? [];
    const fromItems = content.items.flatMap((item) => Object.keys(item.attributes));
    const seen = new Set<string>(fromCriteria);
    fromItems.forEach((k) => seen.add(k));
    return Array.from(seen);
  }, [content.items, content.comparisonCriteria]);

  const actionSlot = (
    <div className="space-y-4">
      {content.front !== undefined && content.front !== '' && (
        <p className="text-base font-medium text-foreground">{content.front}</p>
      )}

      {/* Comparison table */}
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-1/4">
                Criterion
              </th>
              {content.items.map((item) => (
                <th key={item.label} className="px-3 py-2 text-left font-semibold text-foreground">
                  {item.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allKeys.map((key, rowIdx) => (
              <tr
                key={key}
                className={cn(
                  'border-b border-border last:border-0',
                  rowIdx % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                )}
              >
                <td className="px-3 py-2 font-medium text-muted-foreground">{key}</td>
                {content.items.map((item) => (
                  <td key={item.label} className="px-3 py-2 text-foreground">
                    {item.attributes[key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
            {allKeys.length === 0 && (
              <tr>
                <td
                  colSpan={content.items.length + 1}
                  className="px-3 py-4 text-center text-muted-foreground italic"
                >
                  No comparison criteria defined.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
      {content.back !== undefined && content.back !== '' && (
        <p className="text-sm text-foreground">{content.back}</p>
      )}
    </CardShell>
  );
}
