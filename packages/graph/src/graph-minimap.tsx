'use client';
/**
 * @noema/graph — Graph / GraphMinimap
 *
 * Scaled-down SVG thumbnail of the full graph.
 */
import * as React from 'react';
import type { IGraphNodeDto } from '@noema/api-client';
import { NODE_TYPE_COLOR } from './graph-node.js';

// Local shape: IGraphNodeDto (any when unresolved) plus optional position fields
interface INodeWithPos {
  id?: string | null;
  type?: string | null;
  x?: number;
  y?: number;
}

interface IGraphMinimapProps {
  nodes: IGraphNodeDto[];
  selectedNodeId?: string | null;
  className?: string;
}

function buildFallbackPosition(index: number, total: number, size: number): [number, number] {
  const columns = Math.max(1, Math.ceil(Math.sqrt(total)));
  const rows = Math.max(1, Math.ceil(total / columns));
  const column = index % columns;
  const row = Math.floor(index / columns);
  const x = ((column + 1) / (columns + 1)) * (size - 12) + 6;
  const y = ((row + 1) / (rows + 1)) * (size - 12) + 6;
  return [x, y];
}

export function GraphMinimap({
  nodes,
  selectedNodeId,
  className,
}: IGraphMinimapProps): React.JSX.Element {
  const SIZE = 160;

  const positioned = nodes as unknown as INodeWithPos[];
  const positionedWithCoords = positioned.filter(
    (node) => Number.isFinite(node.x) && Number.isFinite(node.y)
  );

  const xs = positionedWithCoords.map((n) => n.x ?? 0);
  const ys = positionedWithCoords.map((n) => n.y ?? 0);
  const minX = xs.length > 0 ? Math.min(...xs) : 0;
  const maxX = xs.length > 0 ? Math.max(...xs) : 1;
  const minY = ys.length > 0 ? Math.min(...ys) : 0;
  const maxY = ys.length > 0 ? Math.max(...ys) : 1;
  const rangeX = maxX - minX !== 0 ? maxX - minX : 1;
  const rangeY = maxY - minY !== 0 ? maxY - minY : 1;
  const useFallbackLayout = positionedWithCoords.length < 2;

  function toSvg(x: number, y: number): [number, number] {
    return [((x - minX) / rangeX) * (SIZE - 10) + 5, ((y - minY) / rangeY) * (SIZE - 10) + 5];
  }

  const getNodeKey = React.useCallback((node: INodeWithPos, index: number): string => {
    const nodeId =
      typeof node.id === 'string' && node.id.length > 0 ? node.id : `node-${index}`;
    return `${nodeId}-${index}`;
  }, []);

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
      className={['rounded border border-border bg-background/80', className ?? ''].join(' ')}
      aria-label="Graph minimap"
    >
      {positioned.map((n, index) => {
        const [sx, sy] =
          useFallbackLayout || !Number.isFinite(n.x) || !Number.isFinite(n.y)
            ? buildFallbackPosition(index, positioned.length, SIZE)
            : toSvg(n.x ?? 0, n.y ?? 0);
        const nodeId = typeof n.id === 'string' ? n.id : null;
        const nodeType = typeof n.type === 'string' ? n.type : '';
        const color: string = NODE_TYPE_COLOR[nodeType] ?? '#6b7280';
        const isSelected = nodeId === selectedNodeId;
        return (
          <circle
            key={getNodeKey(n, index)}
            cx={sx}
            cy={sy}
            r={isSelected ? 4 : 2}
            fill={color}
            opacity={isSelected ? 1 : 0.6}
          />
        );
      })}
    </svg>
  );
}
