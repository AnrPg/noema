'use client';
/**
 * @noema/web — Knowledge / RadarChart
 *
 * 11-axis SVG spider/radar chart for structural metrics.
 * Each axis is labeled; current values form a filled polygon.
 * An optional "ideal" polygon shows baseline at low opacity.
 */
import * as React from 'react';

export interface IRadarMetric {
  key: string;
  label: string; // abbreviated axis label (shown on chart)
  fullLabel: string; // full metric name (shown in drill-down)
  value: number; // 0–1 normalized
  ideal?: number; // 0–1 optional baseline
}

interface IRadarChartProps {
  metrics: IRadarMetric[];
  size?: number; // SVG size px (default 360)
  onAxisClick?: (metric: IRadarMetric) => void;
  selectedKey?: string | null;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

export function RadarChart({
  metrics,
  size = 360,
  onAxisClick,
  selectedKey,
}: IRadarChartProps): React.JSX.Element {
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * 0.72;
  const n = metrics.length;
  const step = n > 0 ? 360 / n : 360;

  // Build polygon points for a set of normalized values
  function buildPolygon(values: number[]): string {
    return values
      .map((v, i) => {
        const [x, y] = polarToCartesian(cx, cy, r * v, i * step);
        return `${String(x)},${String(y)}`;
      })
      .join(' ');
  }

  const gridRings = [0.2, 0.4, 0.6, 0.8, 1.0];
  const currentPoints = buildPolygon(metrics.map((m) => m.value));
  const hasIdeal = metrics.some((m) => m.ideal !== undefined);
  const idealPoints = hasIdeal ? buildPolygon(metrics.map((m) => m.ideal ?? 0)) : null;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${String(size)} ${String(size)}`}
      aria-label="Structural metrics radar chart"
      role="img"
    >
      {/* Grid rings */}
      {gridRings.map((pct) => (
        <polygon
          key={String(pct)}
          points={buildPolygon(metrics.map(() => pct))}
          fill="none"
          stroke="#334155"
          strokeWidth="1"
        />
      ))}

      {/* Axis lines + labels */}
      {metrics.map((m, i) => {
        const [ax, ay] = polarToCartesian(cx, cy, r, i * step);
        const [lx, ly] = polarToCartesian(cx, cy, r * 1.2, i * step);
        const isSelected = selectedKey === m.key;
        return (
          <g key={m.key}>
            <line x1={cx} y1={cy} x2={ax} y2={ay} stroke="#334155" strokeWidth="1" />
            <text
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="9"
              fill={isSelected ? '#7c6ee6' : '#94a3b8'}
              fontWeight={isSelected ? 'bold' : 'normal'}
              style={{ cursor: onAxisClick !== undefined ? 'pointer' : 'default' }}
              role={onAxisClick !== undefined ? 'button' : undefined}
              aria-label={onAxisClick !== undefined ? `Drill down: ${m.fullLabel}` : undefined}
              onClick={() => {
                onAxisClick?.(m);
              }}
              tabIndex={onAxisClick !== undefined ? 0 : undefined}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  onAxisClick?.(m);
                }
              }}
            >
              {m.label}
            </text>
          </g>
        );
      })}

      {/* Ideal polygon (if any metric has ideal value) */}
      {idealPoints !== null && (
        <polygon
          points={idealPoints}
          fill="rgba(134,239,172,0.08)"
          stroke="#86efac60"
          strokeWidth="1.5"
          strokeDasharray="4 2"
        />
      )}

      {/* Current values polygon */}
      <polygon
        points={currentPoints}
        fill="rgba(124,110,230,0.18)"
        stroke="#7c6ee6"
        strokeWidth="2"
      />

      {/* Value dots on axes */}
      {metrics.map((m, i) => {
        const [dx, dy] = polarToCartesian(cx, cy, r * m.value, i * step);
        return (
          <circle
            key={m.key}
            cx={dx}
            cy={dy}
            r={selectedKey === m.key ? 5 : 3}
            fill={selectedKey === m.key ? '#7c6ee6' : '#7c6ee6cc'}
            style={{ cursor: onAxisClick !== undefined ? 'pointer' : 'default' }}
            onClick={() => {
              onAxisClick?.(m);
            }}
            role={onAxisClick !== undefined ? 'button' : undefined}
            aria-label={onAxisClick !== undefined ? `Drill down: ${m.fullLabel}` : undefined}
          />
        );
      })}
    </svg>
  );
}
