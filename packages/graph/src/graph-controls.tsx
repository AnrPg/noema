'use client';
/**
 * @noema/graph — Graph / GraphControls
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
import type { LayoutMode, OverlayType } from './types.js';
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
  { key: 'pending_mutations', label: 'Pending Mutations' },
];

export interface IGraphControlsProps {
  nodes: IGraphNodeDto[];
  layoutMode: LayoutMode;
  showLabels: boolean;
  activeOverlays: Set<OverlayType>;
  searchQuery: string;
  hiddenTypes: Set<string>;
  onLayoutChange: (mode: LayoutMode) => void;
  onToggleLabels: () => void;
  onOverlayToggle: (overlay: OverlayType) => void;
  onSearchChange: (q: string) => void;
  onNodeSelect: (node: IGraphNodeDto) => void;
  onToggleType: (type: string) => void;
  selectedNodeId?: string | null;
  onClose?: () => void;
}

export function GraphControls({
  nodes,
  layoutMode,
  showLabels,
  activeOverlays,
  searchQuery,
  hiddenTypes,
  onLayoutChange,
  onToggleLabels,
  onOverlayToggle,
  onSearchChange,
  onNodeSelect,
  onToggleType,
  selectedNodeId,
  onClose,
}: IGraphControlsProps): React.JSX.Element {
  const getNodeKey = React.useCallback((node: IGraphNodeDto, index: number): string => {
    const nodeId = typeof node.id === 'string' && node.id.length > 0 ? node.id : `node-${index}`;
    return `${nodeId}-${node.label}`;
  }, []);

  const filteredNodes = React.useMemo(() => {
    return nodes
      .filter(
        (n) => searchQuery === '' || n.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [nodes, searchQuery]);

  return (
    <aside className="flex h-full w-[320px] flex-shrink-0 flex-col gap-4 overflow-hidden border-r border-border bg-card p-3">
      {onClose !== undefined && (
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Controls
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted"
          >
            Hide
          </button>
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2">
        <Search className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          aria-label="Search nodes"
          placeholder="Search nodes…"
          value={searchQuery}
          onChange={(e) => {
            onSearchChange(e.target.value);
          }}
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>

      <div className="noema-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
        {/* Layout toggle */}
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Layout
          </p>
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
          <button
            type="button"
            onClick={onToggleLabels}
            className={[
              'rounded border px-2 py-1 text-xs font-medium transition-colors',
              showLabels
                ? 'border-primary bg-primary/10 text-primary hover:bg-primary/15'
                : 'border-border bg-background text-foreground hover:bg-muted',
            ].join(' ')}
          >
            {showLabels ? 'Labels on' : 'Labels off'}
          </button>
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
        <div className="flex flex-col rounded-md border border-border bg-background/30">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span className="block border-b border-border px-3 py-2">
              Nodes ({String(filteredNodes.length)})
            </span>
          </p>
          <div className="flex flex-col gap-1.5 px-2 py-2">
            {filteredNodes.map((n, index) => {
              const nodeId = n.id as string;
              const nodeLabel = n.label;
              return (
                <button
                  key={getNodeKey(n, index)}
                  type="button"
                  onClick={() => {
                    onNodeSelect(n);
                  }}
                  className={[
                    'w-full rounded-md border px-2.5 py-2 text-left transition-colors',
                    selectedNodeId === nodeId
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-foreground hover:bg-muted',
                  ].join(' ')}
                >
                  <div className="text-xs font-medium leading-snug text-left break-words">
                    {nodeLabel}
                  </div>
                  <div
                    className={[
                      'mt-1 text-[11px] leading-snug break-words',
                      selectedNodeId === nodeId
                        ? 'text-primary-foreground/80'
                        : 'text-muted-foreground',
                    ].join(' ')}
                  >
                    {n.type}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}
