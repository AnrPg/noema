'use client';
/**
 * @noema/web — Reviews / CalibrationChart
 *
 * Scatter plot: predicted confidence (x) vs actual grade outcome (y).
 * Pure SVG, no external charting library.
 */
import * as React from 'react';

export interface ICalibrationPoint {
  predictedConfidence: number; // 0–1
  actualGrade: number; // 1–4
}

export interface ICalibrationChartProps {
  points: ICalibrationPoint[];
  size?: number;
}

export function CalibrationChart({
  points,
  size = 200,
}: ICalibrationChartProps): React.JSX.Element {
  const PAD = 28;
  const innerSize = size - PAD * 2;

  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground"
        style={{ width: `${String(size)}px`, height: `${String(size)}px` }}
      >
        No calibration data
      </div>
    );
  }

  // Grade 1–4 mapped to y 0–1 (inverted: 4=top)
  const gradeToY = (grade: number): number => PAD + innerSize - ((grade - 1) / 3) * innerSize;

  const confidenceToX = (conf: number): number => PAD + conf * innerSize;

  return (
    <svg
      width={size}
      height={size}
      aria-label="Calibration chart: predicted confidence vs actual grade"
      role="img"
      overflow="visible"
    >
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line
            x1={confidenceToX(v)}
            y1={PAD}
            x2={confidenceToX(v)}
            y2={PAD + innerSize}
            stroke="currentColor"
            strokeOpacity={0.1}
            strokeWidth={1}
            className="text-muted-foreground"
          />
          <text
            x={confidenceToX(v)}
            y={PAD + innerSize + 14}
            textAnchor="middle"
            fontSize={9}
            fill="currentColor"
            className="text-muted-foreground"
          >
            {String(Math.round(v * 100))}%
          </text>
        </g>
      ))}
      {[1, 2, 3, 4].map((grade) => (
        <g key={grade}>
          <line
            x1={PAD}
            y1={gradeToY(grade)}
            x2={PAD + innerSize}
            y2={gradeToY(grade)}
            stroke="currentColor"
            strokeOpacity={0.1}
            strokeWidth={1}
            className="text-muted-foreground"
          />
          <text
            x={PAD - 4}
            y={gradeToY(grade) + 3}
            textAnchor="end"
            fontSize={9}
            fill="currentColor"
            className="text-muted-foreground"
          >
            {grade === 1 ? 'Again' : grade === 2 ? 'Hard' : grade === 3 ? 'Good' : 'Easy'}
          </text>
        </g>
      ))}

      {/* Ideal diagonal reference line */}
      <line
        x1={confidenceToX(0)}
        y1={gradeToY(1)}
        x2={confidenceToX(1)}
        y2={gradeToY(4)}
        stroke="currentColor"
        strokeOpacity={0.2}
        strokeWidth={1}
        strokeDasharray="4 3"
        className="text-muted-foreground"
      />

      {/* Points */}
      {points.map((pt, i) => (
        <circle
          key={i}
          cx={confidenceToX(pt.predictedConfidence)}
          cy={gradeToY(pt.actualGrade)}
          r={4}
          className={
            pt.actualGrade >= 3
              ? 'fill-synapse-400/70 stroke-synapse-400'
              : 'fill-cortex-400/70 stroke-cortex-400'
          }
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}
