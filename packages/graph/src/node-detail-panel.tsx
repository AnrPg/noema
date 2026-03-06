/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';
/**
 * @noema/graph — Graph / NodeDetailPanel
 *
 * Selected node detail panel.
 * Shows: label, type, description, mastery gauge, connected edges, actions.
 */
import * as React from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import type { IGraphNodeDto, IGraphEdgeDto } from '@noema/api-client';
import { NeuralGauge } from '@noema/ui';
import { NODE_TYPE_COLOR } from './graph-node.js';

export interface INodeDetailPanelProps {
  node: IGraphNodeDto;
  allNodes: IGraphNodeDto[];
  allEdges: IGraphEdgeDto[];
  masteryMap?: Record<string, number>;
  onClose: () => void;
  onViewPrerequisites?: (nodeId: string) => void;
}

export function NodeDetailPanel({
  node,
  allNodes,
  allEdges,
  masteryMap = {},
  onClose,
  onViewPrerequisites,
}: INodeDetailPanelProps): React.JSX.Element {
  const nodeIndex = React.useMemo(
    () => Object.fromEntries(allNodes.map((n) => [String((n as any).id), n])),
    [allNodes]
  );

  const connectedEdges = React.useMemo(
    () =>
      allEdges.filter(
        (e) =>
          String((e as any).sourceId) === String((node as any).id) ||
          String((e as any).targetId) === String((node as any).id)
      ),
    [allEdges, node]
  );

  const edgesByType = React.useMemo(() => {
    const groups: Record<string, typeof connectedEdges> = {};
    for (const edge of connectedEdges) {
      const type = String((edge as any).type);
      groups[type] = [...(groups[type] ?? []), edge];
    }
    return groups;
  }, [connectedEdges]);

  const nodeAny = node as any;
  const color: string = NODE_TYPE_COLOR[String(nodeAny.type)] ?? '#6b7280';
  const mastery: number = masteryMap[String(nodeAny.id)] ?? 0;

  return (
    <div className="flex max-h-[340px] w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="flex-shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {String(nodeAny.type)}
          </span>
          <span className="truncate text-sm font-semibold text-foreground">
            {String(nodeAny.label)}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-2 flex-shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Close node detail"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Description + mastery + actions */}
        <div className="flex w-1/2 flex-col gap-3 overflow-y-auto border-r border-border p-3">
          {nodeAny.description !== null &&
            nodeAny.description !== undefined &&
            String(nodeAny.description) !== '' && (
              <p className="text-xs text-muted-foreground">{String(nodeAny.description)}</p>
            )}

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Mastery</span>
            <NeuralGauge value={mastery} size="sm" />
            <span className="text-xs tabular-nums text-foreground">
              {String(Math.round(mastery * 100))}%
            </span>
          </div>

          {Array.isArray(nodeAny.tags) && (nodeAny.tags as string[]).length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Domain:</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {String((nodeAny.tags as string[])[0])}
              </span>
            </div>
          )}
          {Array.isArray(nodeAny.tags) && (nodeAny.tags as string[]).length > 1 && (
            <div className="flex flex-wrap gap-1">
              {(nodeAny.tags as string[]).slice(1).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-1">
            {onViewPrerequisites !== undefined && (
              <button
                type="button"
                onClick={() => {
                  onViewPrerequisites(String(nodeAny.id));
                }}
                className="text-left text-xs text-primary hover:underline"
              >
                View prerequisites
              </button>
            )}
            <button
              type="button"
              disabled
              className="cursor-not-allowed text-left text-xs text-muted-foreground line-through"
            >
              Find related concepts
            </button>
            <Link
              href={'/knowledge/comparison' as never}
              className="text-xs text-primary hover:underline"
            >
              Compare with CKG
            </Link>
          </div>

          {/* Linked cards (shown if metadata contains cardIds) */}
          {Array.isArray(nodeAny.metadata?.cardIds) && (
            <div className="mt-2">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Linked Cards
              </p>
              {(nodeAny.metadata.cardIds as string[]).slice(0, 5).map((cardId: string) => (
                <Link
                  key={cardId}
                  href={`/cards/${cardId}` as never}
                  className="block truncate text-xs text-primary hover:underline"
                >
                  {cardId}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right: Connected edges grouped by type */}
        <div className="flex w-1/2 flex-col overflow-y-auto p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Connected ({String(connectedEdges.length)})
          </p>
          <div className="flex flex-col gap-1">
            {Object.entries(edgesByType).map(([type, typeEdges]) => (
              <div key={type} className="mb-2">
                <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {type}
                </p>
                {typeEdges.slice(0, 6).map((edge) => {
                  const edgeAny = edge as any;
                  const otherId =
                    String(edgeAny.sourceId) === String(nodeAny.id)
                      ? String(edgeAny.targetId)
                      : String(edgeAny.sourceId);
                  const other = nodeIndex[otherId];
                  return (
                    <div
                      key={String(edgeAny.id)}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="truncate text-foreground">
                        {other !== undefined ? String((other as any).label) : otherId}
                      </span>
                      <span className="ml-2 flex-shrink-0 tabular-nums text-muted-foreground">
                        {Number(edgeAny.weight).toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
