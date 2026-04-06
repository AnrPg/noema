/**
 * @noema/knowledge-graph-service — Semantic Misconception Detector
 *
 * Vector-similarity-based misconception detection.
 * Gated behind vectorServiceEnabled config flag:
 * - When disabled: skips detection entirely (returns empty).
 * - When enabled: will perform semantic similarity checks using node embeddings.
 *
 * TODO(NOEMA-vector): Implement semantic similarity checks using node embeddings
 *       to detect concepts that are semantically close but placed
 *       far apart in the graph (or vice versa).
 *       Tracked: Phase 12 — vector service integration for misconception detection.
 */

import {
  ConfidenceScore as ConfidenceScoreFactory,
  MisconceptionPatternKind,
  type NodeId,
} from '@noema/types';

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

  detect(ctx: IMisconceptionDetectionContext): IMisconceptionDetectionResult[] {
    if (!this.config.vectorServiceEnabled) {
      // Vector service not available — skip semantic detection entirely
      return [];
    }

    const semanticPatterns = ctx.patterns.filter((pattern) => pattern.kind === this.kind);
    if (semanticPatterns.length === 0) {
      return [];
    }

    const results: IMisconceptionDetectionResult[] = [];
    const seenPairs = new Set<string>();

    for (let index = 0; index < ctx.pkgSubgraph.nodes.length; index += 1) {
      const leftNode = ctx.pkgSubgraph.nodes[index];
      if (leftNode === undefined) {
        continue;
      }

      for (let inner = index + 1; inner < ctx.pkgSubgraph.nodes.length; inner += 1) {
        const rightNode = ctx.pkgSubgraph.nodes[inner];
        if (leftNode.domain !== rightNode?.domain) {
          continue;
        }

        const similarity = lexicalSimilarity(leftNode.label, rightNode.label);
        if (similarity < 0.82 || haveDirectRelation(ctx, leftNode.nodeId, rightNode.nodeId)) {
          continue;
        }

        const pairKey = createPairKey(leftNode.nodeId, rightNode.nodeId);
        if (seenPairs.has(pairKey)) {
          continue;
        }
        seenPairs.add(pairKey);

        for (const pattern of semanticPatterns) {
          results.push({
            patternId: pattern.patternId,
            confidence: ConfidenceScoreFactory.clamp(0.55 + similarity * 0.3),
            affectedNodeIds: [leftNode.nodeId, rightNode.nodeId],
            description:
              `Semantically similar concepts "${leftNode.label}" and "${rightNode.label}" ` +
              'appear disconnected or weakly integrated in the PKG. Review whether they should be linked, merged, or distinguished more clearly.',
          });
        }
      }
    }

    return results;
  }
}

function normalizeSemanticLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

function compactSemanticLabel(label: string): string {
  return normalizeSemanticLabel(label).replace(/[^a-z0-9]+/g, '');
}

function tokenSet(label: string): Set<string> {
  return new Set(
    normalizeSemanticLabel(label)
      .split(/[^a-z0-9]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
  );
}

function lexicalSimilarity(left: string, right: string): number {
  const leftCompact = compactSemanticLabel(left);
  const rightCompact = compactSemanticLabel(right);
  if (leftCompact.length === 0 || rightCompact.length === 0) {
    return 0;
  }
  if (leftCompact === rightCompact) {
    return 1;
  }

  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const tokenJaccard = union === 0 ? 0 : intersection / union;

  const prefixOverlap =
    longestCommonPrefix(leftCompact, rightCompact).length /
    Math.max(leftCompact.length, rightCompact.length);

  const containment =
    leftCompact.includes(rightCompact) || rightCompact.includes(leftCompact) ? 1 : 0;

  return Math.max(tokenJaccard, prefixOverlap, containment * 0.9);
}

function longestCommonPrefix(left: string, right: string): string {
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) {
    index += 1;
  }
  return left.slice(0, index);
}

function haveDirectRelation(
  ctx: IMisconceptionDetectionContext,
  leftNodeId: NodeId,
  rightNodeId: NodeId
): boolean {
  return ctx.pkgSubgraph.edges.some(
    (edge) =>
      (edge.sourceNodeId === leftNodeId && edge.targetNodeId === rightNodeId) ||
      (edge.sourceNodeId === rightNodeId && edge.targetNodeId === leftNodeId)
  );
}

function createPairKey(left: NodeId, right: NodeId): string {
  return [left, right].sort().join('::');
}
