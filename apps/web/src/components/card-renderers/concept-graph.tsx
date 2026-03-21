'use client';

/**
 * @noema/web - Card Renderers
 * ConceptGraphRenderer — text-based concept relationship visualization.
 */

import * as React from 'react';
import type { IConceptGraphContent } from '@noema/api-client';
import { CardShell } from './card-shell';
import type { ICardRendererProps } from './types';

export default function ConceptGraphRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode, isRevealed } = props;
  const content = card.content as unknown as IConceptGraphContent;

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="font-medium line-clamp-1">{content.targetConcept}</span>
        <span className="text-muted-foreground text-xs ml-1">
          · {String(content.nodes.length)} node{content.nodes.length !== 1 ? 's' : ''}
        </span>
      </CardShell>
    );
  }

  // Find the central/target node if it exists in nodes list
  const centralNode = content.nodes.find(
    (n) => n.label.toLowerCase() === content.targetConcept.toLowerCase()
  );

  const actionSlot = (
    <div className="space-y-4">
      {content.front !== undefined && content.front !== '' && (
        <p className="text-base font-medium text-foreground">{content.front}</p>
      )}

      {/* Central concept header */}
      <div className="rounded border border-synapse-400/40 bg-synapse-400/5 p-3 text-center">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          Central Concept
        </p>
        <p className="text-base font-semibold text-foreground">{content.targetConcept}</p>
        {centralNode?.description !== undefined && centralNode.description !== '' && (
          <p className="text-sm text-muted-foreground mt-1">{centralNode.description}</p>
        )}
      </div>

      {/* Relationship list — always shown in interactive mode */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Relationships ({String(content.edges.length)})
        </p>
        {content.edges.map((edge) => {
          const fromNode = content.nodes.find((n) => n.id === edge.from);
          const toNode = content.nodes.find((n) => n.id === edge.to);
          return (
            <div
              key={`${edge.from}-${edge.to}-${edge.label}`}
              className="flex items-center gap-2 text-sm rounded border border-border bg-muted/20 px-3 py-2"
            >
              <span className="font-medium text-foreground">{fromNode?.label ?? edge.from}</span>
              <span className="text-xs text-synapse-500 font-mono px-1 py-0.5 rounded bg-synapse-400/10">
                {edge.label}
              </span>
              <span className="font-medium text-foreground">{toNode?.label ?? edge.to}</span>
              {isRevealed && edge.description !== undefined && edge.description !== '' && (
                <span className="text-xs text-muted-foreground ml-auto">{edge.description}</span>
              )}
            </div>
          );
        })}
        {content.edges.length === 0 && (
          <p className="text-sm text-muted-foreground italic">No relationships defined.</p>
        )}
      </div>

      {/* All nodes list — shown when not yet revealed */}
      {!isRevealed && content.nodes.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Nodes ({String(content.nodes.length)})
          </p>
          <div className="flex flex-wrap gap-2">
            {content.nodes.map((node) => (
              <span
                key={node.id}
                className="rounded-full border border-border bg-muted/30 px-3 py-1 text-xs text-foreground"
              >
                {node.label}
              </span>
            ))}
          </div>
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
      {/* Revealed: node details with descriptions */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Node Details
        </p>
        {content.nodes
          .filter((n) => n.description !== undefined && n.description !== '')
          .map((node) => (
            <div key={node.id} className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">{node.label}</p>
              <p className="text-sm text-muted-foreground">{node.description}</p>
            </div>
          ))}
        {content.nodes.every((n) => n.description === undefined || n.description === '') && (
          <p className="text-sm text-muted-foreground italic">No additional node descriptions.</p>
        )}
        {content.explanation !== undefined && content.explanation !== '' && (
          <p className="text-sm text-muted-foreground border-t border-border pt-3">
            {content.explanation}
          </p>
        )}
      </div>
    </CardShell>
  );
}
