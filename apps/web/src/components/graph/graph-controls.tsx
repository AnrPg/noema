/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
'use client';
/**
 * @noema/web — Graph / GraphControls
 *
 * Left control panel for the PKG Explorer:
 *   - Search input (filters nodes by label)
 *   - Layout mode buttons (force / hierarchical / radial)
 *   - Overlay checkboxes
 *   - GraphLegend (type filter)
 *   - Scrollable node list
 */
import * as React from 'react';
import { Search } from 'lucide-react';
import type { IGraphNodeDto } from '@noema/api-client';
import type { LayoutMode, OverlayType } from '@/stores/graph-store';
import { GraphLegend } from './graph-legend.js';

const LAYOUT_BUTTONS: { mode: LayoutMode; label: string }[] = [
  { mode: 'force', label: 'Force' },
  { mode: 'hierarchical', label: 'Tree' },
  { mode: 'radial', label: 'Radial' },
];

const OVERLAY_OPTIONS: { key: OverlayType; label: string }[] = [
  { key: 'prerequisites', label: 'Prerequisites' },
  { key: 'frontier', label: 'Knowledge Frontier' },
  { key: 'bridges', label: 'Bridge Nodes' },
  { key: 'misconceptions', label: 'Misconceptions' },
  { key: 'centrality', label: 'Mastery Heat' },
];

export interface IGraphControlsProps {
  nodes: IGraphNodeDto[];
  layoutMode: LayoutMode;
  activeOverlays: Set<OverlayType>;
  searchQuery: string;
  hiddenTypes: Set<string>;
  onLayoutChange: (mode: LayoutMode) => void;
  onOverlayToggle: (overlay: OverlayType) => void;
  onSearchChange: (q: string) => void;
  onNodeSelect: (node: IGraphNodeDto) => void;
  onToggleType: (type: string) => void;
  selectedNodeId?: string | null;
}

export function GraphControls({
  nodes,
  layoutMode,
  activeOverlays,
  searchQuery,
  hiddenTypes,
  onLayoutChange,
  onOverlayToggle,
  onSearchChange,
  onNodeSelect,
  onToggleType,
  selectedNodeId,
}: IGraphControlsProps): React.JSX.Element {
  const filteredNodes = React.useMemo(
    () =>
      nodes
        .filter(
          (n) =>
            searchQuery === '' ||
            String((n as any).label)
              .toLowerCase()
              .includes(searchQuery.toLowerCase())
        )
        .sort((a, b) => String((a as any).label).localeCompare(String((b as any).label))),
    [nodes, searchQuery]
  );

  return (
    <aside className="flex h-full w-[280px] flex-shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-card p-3">
      {/* Search */}
      <div className="relative">
        <Search
          className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          placeholder="Search nodes…"
          value={searchQuery}
          onChange={(e) => {
            onSearchChange(e.target.value);
          }}
          className="w-full rounded-md border border-input bg-background py-1.5 pl-7 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Layout toggle */}
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Layout</p>
        <div className="flex gap-1">
          {LAYOUT_BUTTONS.map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                onLayoutChange(mode);
              }}
              className={[
                'flex-1 rounded py-1 text-xs font-medium transition-colors',
                layoutMode === mode
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-background text-foreground hover:bg-muted',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Overlays */}
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Overlays
        </p>
        {OVERLAY_OPTIONS.map(({ key, label }) => (
          <label
            key={key}
            className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
          >
            <input
              type="checkbox"
              checked={activeOverlays.has(key)}
              onChange={() => {
                onOverlayToggle(key);
              }}
              className="rounded border-border"
            />
            {label}
          </label>
        ))}
      </div>

      {/* Legend */}
      <GraphLegend hiddenTypes={hiddenTypes} onToggleType={onToggleType} />

      {/* Node list */}
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Nodes ({String(filteredNodes.length)})
        </p>
        {filteredNodes.map((n) => {
          const nAny = n as any;
          const nodeId = String(nAny.id);
          const nodeLabel = String(nAny.label);
          return (
            <button
              key={nodeId}
              type="button"
              onClick={() => {
                onNodeSelect(n);
              }}
              className={[
                'w-full truncate rounded px-2 py-1 text-left text-xs transition-colors',
                selectedNodeId === nodeId
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground hover:bg-muted',
              ].join(' ')}
            >
              {nodeLabel}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
