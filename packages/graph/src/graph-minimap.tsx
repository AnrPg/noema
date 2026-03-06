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
  id: string;
  type: string;
  x?: number;
  y?: number;
}

interface IGraphMinimapProps {
  nodes: IGraphNodeDto[];
  selectedNodeId?: string | null;
  className?: string;
}

export function GraphMinimap({
  nodes,
  selectedNodeId,
  className,
}: IGraphMinimapProps): React.JSX.Element {
  const SIZE = 160;

  const positioned = nodes as unknown as INodeWithPos[];

  const xs = positioned.map((n) => n.x ?? 0);
  const ys = positioned.map((n) => n.y ?? 0);
  const minX = xs.length > 0 ? Math.min(...xs) : 0;
  const maxX = xs.length > 0 ? Math.max(...xs) : 1;
  const minY = ys.length > 0 ? Math.min(...ys) : 0;
  const maxY = ys.length > 0 ? Math.max(...ys) : 1;
  const rangeX = maxX - minX !== 0 ? maxX - minX : 1;
  const rangeY = maxY - minY !== 0 ? maxY - minY : 1;

  function toSvg(x: number, y: number): [number, number] {
    return [((x - minX) / rangeX) * (SIZE - 10) + 5, ((y - minY) / rangeY) * (SIZE - 10) + 5];
  }

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
      className={['rounded border border-border bg-background/80', className ?? ''].join(' ')}
      aria-label="Graph minimap"
    >
      {positioned.map((n) => {
        const [sx, sy] = toSvg(n.x ?? 0, n.y ?? 0);
        const color: string = NODE_TYPE_COLOR[n.type] ?? '#6b7280';
        const isSelected = n.id === selectedNodeId;
        return (
          <circle
            key={n.id}
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
