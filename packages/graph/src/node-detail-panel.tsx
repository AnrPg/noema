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

function decodeEscapedText(value: string): string {
  return value
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16))
    );
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function extractLocalizedText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return null;
    }

    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      const parsed = parseJsonRecord(trimmed);
      if (parsed !== null) {
        return extractLocalizedText(parsed);
      }
    }

    return decodeEscapedText(trimmed);
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const text = extractLocalizedText(entry);
      if (text !== null) {
        return text;
      }
    }
    return null;
  }

  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  for (const key of ['literal', 'label', 'preferredLabel', 'title', 'name', 'description']) {
    const text = extractLocalizedText(record[key]);
    if (text !== null) {
      return text;
    }
  }

  for (const [key, entry] of Object.entries(record)) {
    if (/^[a-z]{2}(-[A-Z]{2})?$/u.test(key)) {
      const text = extractLocalizedText(entry);
      if (text !== null) {
        return text;
      }
    }
  }

  return null;
}

function humanizeIdentifier(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function deriveBadge(node: Record<string, unknown>): string {
  const metadata =
    typeof node['metadata'] === 'object' && node['metadata'] !== null
      ? (node['metadata'] as Record<string, unknown>)
      : {};
  const rawId =
    typeof node['id'] === 'string'
      ? node['id']
      : typeof metadata['uri'] === 'string'
        ? (metadata['uri'] as string)
        : '';

  const uriMatch = rawId.match(/\/esco\/([^/]+)\/([^/?#]+)$/u);
  if (uriMatch !== null) {
    return `${String(uriMatch[1]).toUpperCase()} ${uriMatch[2]}`;
  }

  const type = typeof node['type'] === 'string' ? node['type'] : '';
  if (type !== '') {
    return humanizeIdentifier(type);
  }

  return 'Node';
}

function deriveDescription(node: Record<string, unknown>): string | null {
  const metadata =
    typeof node['metadata'] === 'object' && node['metadata'] !== null
      ? (node['metadata'] as Record<string, unknown>)
      : {};

  const candidates = [node['description'], metadata['description']];
  for (const candidate of candidates) {
    const text = extractLocalizedText(candidate);
    if (text !== null && text !== '') {
      return text;
    }
  }

  return null;
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
  const titleText =
    extractLocalizedText(nodeAny.label) ??
    (typeof nodeAny.label === 'string' && nodeAny.label !== '' ? nodeAny.label : String(nodeAny.id));
  const badgeText = deriveBadge(nodeAny as Record<string, unknown>);
  const descriptionText = deriveDescription(nodeAny as Record<string, unknown>);
  const connectedTitle = connectedEdges.length === 0 ? 'Connected (0)' : `Connected (${String(connectedEdges.length)})`;

  return (
    <div className="flex h-full min-h-0 max-h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="flex-shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {badgeText}
          </span>
          <span className="truncate text-sm font-semibold text-foreground">
            {titleText}
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

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: Description + mastery + actions */}
        <div className="noema-scrollbar flex min-h-0 w-1/2 flex-col gap-3 overflow-y-auto border-r border-border p-3">
          {descriptionText !== null && descriptionText !== '' && (
            <div className="space-y-2 text-xs text-muted-foreground">
              {descriptionText
                .split(/\n{2,}/)
                .map((block) => block.trim())
                .filter((block) => block !== '')
                .map((block) => (
                  <p key={block} className="whitespace-pre-line">
                    {block}
                  </p>
                ))}
            </div>
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
        <div className="noema-scrollbar flex min-h-0 w-1/2 flex-col overflow-y-auto p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {connectedTitle}
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
                        {other !== undefined
                          ? extractLocalizedText((other as any).label) ?? String((other as any).label)
                          : otherId}
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
