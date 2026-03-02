/**
 * @noema/knowledge-graph-service — Semantic Misconception Detector
 *
 * Vector-similarity-based misconception detection.
 * Gated behind vectorServiceEnabled config flag:
 * - When disabled: skips detection entirely (returns empty).
 * - When enabled: will perform semantic similarity checks using node embeddings.
 *
 * TODO: Implement semantic similarity checks using node embeddings
 *       to detect concepts that are semantically close but placed
 *       far apart in the graph (or vice versa).
 */

import { MisconceptionPatternKind } from '@noema/types';

import type {
  IMisconceptionDetectionContext,
  IMisconceptionDetectionResult,
  IMisconceptionDetector,
} from '../types.js';

export interface ISemanticDetectorConfig {
  readonly vectorServiceEnabled: boolean;
}

export class SemanticMisconceptionDetector implements IMisconceptionDetector {
  readonly kind = MisconceptionPatternKind.SEMANTIC;
  private readonly config: ISemanticDetectorConfig;

  constructor(config: ISemanticDetectorConfig = { vectorServiceEnabled: false }) {
    this.config = config;
  }

  detect(_ctx: IMisconceptionDetectionContext): IMisconceptionDetectionResult[] {
    if (!this.config.vectorServiceEnabled) {
      // Vector service not available — skip semantic detection entirely
      return [];
    }

    // Vector service is enabled but detection is not yet implemented
    throw new Error(
      'SemanticMisconceptionDetector: vector service is enabled but semantic ' +
        'detection is not yet implemented. Disable vectorServiceEnabled or ' +
        'implement the detection logic.'
    );
  }
}
