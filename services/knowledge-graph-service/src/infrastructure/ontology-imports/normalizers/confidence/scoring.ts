import type {
  INormalizedOntologyMappingCandidate,
  OntologyMergeConfidenceBand,
  OntologyMergeConflictKind,
} from '../../../../domain/knowledge-graph-service/ontology-imports.contracts.js';

const BASE_SCORES: Record<INormalizedOntologyMappingCandidate['mappingKind'], number> = {
  exact_match: 0.92,
  close_match: 0.72,
  broad_match: 0.58,
  narrow_match: 0.58,
  related_match: 0.45,
};

const TRUSTED_EXTERNAL_HOSTS = [
  'wikidata.org',
  'dbpedia.org',
  'geonames.org',
  'id.loc.gov',
  'vocab.getty.edu',
  'getty.edu',
  'openalex.org',
  'data.europa.eu',
];

export function scoreNormalizedMappings(
  mappings: INormalizedOntologyMappingCandidate[]
): INormalizedOntologyMappingCandidate[] {
  return mappings.map((mapping) => {
    const { confidenceScore, confidenceBand, conflictFlags } = scoreMapping(mapping, mappings);

    return {
      ...mapping,
      confidenceScore,
      confidenceBand,
      conflictFlags,
    };
  });
}

function scoreMapping(
  mapping: INormalizedOntologyMappingCandidate,
  mappings: INormalizedOntologyMappingCandidate[]
): {
  confidenceScore: number;
  confidenceBand: OntologyMergeConfidenceBand;
  conflictFlags: OntologyMergeConflictKind[];
} {
  let score = BASE_SCORES[mapping.mappingKind];
  const conflictFlags = new Set<OntologyMergeConflictKind>();

  if (mapping.externalId.startsWith('derived:')) {
    score -= 0.08;
  }

  if (mapping.provenance.length > 1) {
    score += 0.03;
  }

  if (isTrustedExternalIdentifier(mapping.sourceExternalId)) {
    score += 0.02;
  }

  if (isTrustedExternalIdentifier(mapping.targetExternalId)) {
    score += 0.04;
  } else if (mapping.mappingKind === 'close_match') {
    conflictFlags.add('weak_mapping_only');
    score -= 0.12;
  }

  if (hasConflictingExactTarget(mapping, mappings)) {
    conflictFlags.add('mapping_conflict');
    score -= 0.25;
  }

  const confidenceScore = clamp(score, 0.1, 0.99);
  return {
    confidenceScore,
    confidenceBand: toConfidenceBand(confidenceScore),
    conflictFlags: [...conflictFlags],
  };
}

function hasConflictingExactTarget(
  mapping: INormalizedOntologyMappingCandidate,
  mappings: INormalizedOntologyMappingCandidate[]
): boolean {
  if (mapping.mappingKind !== 'exact_match') {
    return false;
  }

  const exactTargets = mappings
    .filter(
      (candidate) =>
        candidate.mappingKind === 'exact_match' &&
        candidate.sourceExternalId === mapping.sourceExternalId
    )
    .map((candidate) => candidate.targetExternalId);

  return new Set(exactTargets).size > 1;
}

function isTrustedExternalIdentifier(value: string): boolean {
  return TRUSTED_EXTERNAL_HOSTS.some((host) => value.includes(host));
}

function toConfidenceBand(score: number): OntologyMergeConfidenceBand {
  if (score >= 0.85) {
    return 'high';
  }

  if (score >= 0.6) {
    return 'medium';
  }

  return 'low';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
