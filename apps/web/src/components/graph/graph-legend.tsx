'use client';
/**
 * @noema/web — Graph / GraphLegend
 *
 * Filterable node-type legend. Toggling a type calls onToggleType.
 */
import * as React from 'react';
import type { NodeType } from '@noema/api-client';
import { NODE_TYPE_COLOR } from './graph-node.js';

const NODE_TYPES: string[] = [
  'concept',
  'skill',
  'fact',
  'procedure',
  'principle',
  'example',
  'counterexample',
  'misconception',
];

export interface IGraphLegendProps {
  hiddenTypes?: Set<string>;
  onToggleType: (type: string) => void;
}

export function GraphLegend({
  hiddenTypes = new Set(),
  onToggleType,
}: IGraphLegendProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Legend</p>
      {NODE_TYPES.map((type) => {
        const color: string = NODE_TYPE_COLOR[type] ?? '#6b7280';
        const isHidden = hiddenTypes.has(type);
        return (
          <button
            key={type}
            type="button"
            onClick={() => {
              onToggleType(type);
            }}
            className={[
              'flex items-center gap-2 rounded px-1.5 py-0.5 text-xs transition-opacity',
              isHidden ? 'opacity-40' : 'opacity-100',
            ].join(' ')}
          >
            <span
              className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="capitalize text-foreground">{type}</span>
          </button>
        );
      })}
    </div>
  );
}

// Re-export NodeType for consumers
export type { NodeType };
