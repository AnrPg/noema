/**
 * @noema/knowledge-graph-service — Misconception Detection Engine
 *
 * Orchestrates misconception detectors (structural, statistical, semantic)
 * and merges their results. Each detector implements IMisconceptionDetector
 * and handles one MisconceptionPatternKind.
 *
 * Design: Strategy per-kind with detector registry (ADR-006, D3-C).
 */

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

export class MisconceptionDetectionEngine {
  private readonly detectors: readonly IMisconceptionDetector[];

  constructor() {
    this.detectors = [
      new StructuralMisconceptionDetector(),
      new StatisticalMisconceptionDetector(),
      new SemanticMisconceptionDetector(),
    ];
  }

  /**
   * Run all detectors against the given context.
   * Returns consolidated detection results.
   */
  detectAll(ctx: IMisconceptionDetectionContext): IMisconceptionDetectionResult[] {
    const allResults: IMisconceptionDetectionResult[] = [];

    for (const detector of this.detectors) {
      try {
        const results = detector.detect(ctx);
        allResults.push(...results);
      } catch (error) {
        // Defensive: a single detector failure shouldn't crash the pipeline

        console.error(`MisconceptionDetectionEngine: ${detector.kind} detector failed:`, error);
      }
    }

    return allResults;
  }
}
