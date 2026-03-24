import type { IGraphNode } from '@noema/types';
import type {
  ICanonicalNodeResolution,
  ICanonicalNodeResolutionResult,
  OntologyMergeConfidenceBand,
  OntologyMergeConflictKind,
} from '../../../../domain/knowledge-graph-service/ontology-imports.contracts.js';

type ResolutionStrategy = ICanonicalNodeResolution['strategy'];

const STRATEGY_CONFIDENCE: Record<
  ResolutionStrategy,
  { score: number; band: OntologyMergeConfidenceBand }
> = {
  external_id: { score: 0.98, band: 'high' },
  iri: { score: 0.96, band: 'high' },
  alias: { score: 0.78, band: 'medium' },
  label: { score: 0.74, band: 'medium' },
  normalized_label: { score: 0.62, band: 'medium' },
  mapping: { score: 0.7, band: 'medium' },
};

export function resolveCanonicalCandidate(input: {
  candidates: IGraphNode[];
  strategy: ResolutionStrategy;
  sourceDomain: string | undefined;
  preferredConfidenceScore?: number;
  preferredConflicts?: OntologyMergeConflictKind[];
}): ICanonicalNodeResolutionResult {
  const { candidates, strategy, sourceDomain, preferredConfidenceScore, preferredConflicts } =
    input;

  if (candidates.length === 0) {
    return {
      resolution: null,
      conflictFlags: [],
    };
  }

  const domainAlignedCandidates =
    sourceDomain === undefined
      ? candidates
      : candidates.filter((candidate) => candidate.domain === sourceDomain);

  if (candidates.length > 1 && domainAlignedCandidates.length !== 1) {
    return {
      resolution: null,
      conflictFlags: ['ambiguous_match'],
    };
  }

  const candidate = domainAlignedCandidates[0] ?? candidates[0];
  if (candidate === undefined) {
    return {
      resolution: null,
      conflictFlags: ['ambiguous_match'],
    };
  }
  const conflictFlags = new Set<OntologyMergeConflictKind>(preferredConflicts ?? []);

  if (
    sourceDomain !== undefined &&
    candidate.domain !== sourceDomain &&
    strategy !== 'external_id' &&
    strategy !== 'iri'
  ) {
    conflictFlags.add('domain_mismatch');
  }

  const strategyConfidence = STRATEGY_CONFIDENCE[strategy];
  const confidenceScore = clamp(
    preferredConfidenceScore === undefined
      ? strategyConfidence.score
      : Math.min(strategyConfidence.score, preferredConfidenceScore),
    0.1,
    0.99
  );

  return {
    resolution: {
      nodeId: candidate.nodeId,
      label: candidate.label,
      nodeType: candidate.nodeType,
      domain: candidate.domain,
      strategy,
      confidenceScore,
      confidenceBand: toConfidenceBand(confidenceScore, strategyConfidence.band),
      conflictFlags: [...conflictFlags],
    },
    conflictFlags: [...conflictFlags],
  };
}

function toConfidenceBand(
  score: number,
  fallbackBand: OntologyMergeConfidenceBand
): OntologyMergeConfidenceBand {
  if (score >= 0.85) {
    return 'high';
  }

  if (score >= 0.6) {
    return 'medium';
  }

  return fallbackBand === 'high' ? 'medium' : 'low';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
