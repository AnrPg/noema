/**
 * @noema/knowledge-graph-service — Semantic Misconception Detector (Stub)
 *
 * Placeholder for vector-similarity-based misconception detection.
 * Will be implemented when vector-service integration is available.
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

export class SemanticMisconceptionDetector implements IMisconceptionDetector {
  readonly kind = MisconceptionPatternKind.SEMANTIC;

  detect(_ctx: IMisconceptionDetectionContext): IMisconceptionDetectionResult[] {
    // Stub: semantic detection requires vector-service integration
    return [];
  }
}
