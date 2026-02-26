/**
 * @noema/knowledge-graph-service — Misconception Detector Types
 *
 * Internal types for the misconception detection engine.
 */

import type { ISubgraph, NodeId } from '@noema/types';

import type { IMisconceptionPattern } from '../misconception.repository.js';
import type { IGraphComparison } from '../value-objects/comparison.js';

// ============================================================================
// Detection context (shared across all detectors)
// ============================================================================

export interface IMisconceptionDetectionContext {
  /** The user's PKG subgraph */
  readonly pkgSubgraph: ISubgraph;

  /** CKG subgraph for the domain */
  readonly ckgSubgraph: ISubgraph;

  /** PKG↔CKG comparison */
  readonly comparison: IGraphComparison;

  /** Active misconception patterns to evaluate */
  readonly patterns: readonly IMisconceptionPattern[];

  /** Knowledge domain */
  readonly domain: string;

  /** User ID */
  readonly userId: string;
}

// ============================================================================
// Detection result (per pattern)
// ============================================================================

export interface IMisconceptionDetectionResult {
  /** Pattern that triggered this detection */
  readonly patternId: string;

  /** Detection confidence (0–1) */
  readonly confidence: number;

  /** Node IDs affected */
  readonly affectedNodeIds: readonly NodeId[];

  /** Human-readable description of the detected misconception */
  readonly description: string;
}

// ============================================================================
// Detector interface
// ============================================================================

/**
 * Strategy interface for misconception detectors.
 * Each detector handles one MisconceptionPatternKind.
 */
export interface IMisconceptionDetector {
  /** Which pattern kind this detector handles */
  readonly kind: string;

  /**
   * Run detection for all patterns of this detector's kind.
   * Returns detected misconceptions.
   */
  detect(ctx: IMisconceptionDetectionContext): IMisconceptionDetectionResult[];
}
