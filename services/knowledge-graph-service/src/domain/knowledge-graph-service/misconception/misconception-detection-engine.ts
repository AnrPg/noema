/**
 * @noema/knowledge-graph-service — Misconception Detection Engine
 *
 * Orchestrates misconception detectors (structural, statistical, semantic)
 * and merges their results. Each detector implements IMisconceptionDetector
 * and handles one MisconceptionPatternKind.
 *
 * Design: Strategy per-kind with detector registry (ADR-006, D3-C).
 */

import type { Logger } from 'pino';

import type {
  IMisconceptionDetectionContext,
  IMisconceptionDetectionResult,
  IMisconceptionDetector,
} from './types.js';

import {
  SemanticMisconceptionDetector,
  StatisticalMisconceptionDetector,
  StructuralMisconceptionDetector,
} from './detectors/index.js';
import type { ISemanticDetectorConfig } from './detectors/index.js';

// ============================================================================
// Config
// ============================================================================

export interface IMisconceptionDetectionEngineConfig {
  readonly vectorServiceEnabled?: boolean;
}

// ============================================================================
// Result types
// ============================================================================

export interface IDetectorStatus {
  readonly kind: string;
  readonly status: 'success' | 'error';
  readonly error?: string;
}

export interface IMisconceptionDetectionEngineResult {
  readonly results: IMisconceptionDetectionResult[];
  readonly detectorStatuses: readonly IDetectorStatus[];
}

// ============================================================================
// Engine
// ============================================================================

export class MisconceptionDetectionEngine {
  private readonly detectors: readonly IMisconceptionDetector[];
  private readonly logger: Logger;

  constructor(logger: Logger, config?: IMisconceptionDetectionEngineConfig) {
    this.logger = logger.child({ component: 'MisconceptionDetectionEngine' });

    const semanticConfig: ISemanticDetectorConfig = {
      vectorServiceEnabled: config?.vectorServiceEnabled ?? false,
    };

    this.detectors = [
      new StructuralMisconceptionDetector(),
      new StatisticalMisconceptionDetector(),
      new SemanticMisconceptionDetector(semanticConfig),
    ];
  }

  /**
   * Run all detectors against the given context.
   * Returns consolidated detection results plus per-detector status.
   */
  detectAll(ctx: IMisconceptionDetectionContext): IMisconceptionDetectionEngineResult {
    const allResults: IMisconceptionDetectionResult[] = [];
    const detectorStatuses: IDetectorStatus[] = [];

    for (const detector of this.detectors) {
      try {
        const results = detector.detect(ctx);
        allResults.push(...results);
        detectorStatuses.push({ kind: detector.kind, status: 'success' });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        detectorStatuses.push({ kind: detector.kind, status: 'error', error: message });

        this.logger.error(
          { detectorKind: detector.kind, error: message },
          'Misconception detector failed'
        );
      }
    }

    return { results: allResults, detectorStatuses };
  }
}
