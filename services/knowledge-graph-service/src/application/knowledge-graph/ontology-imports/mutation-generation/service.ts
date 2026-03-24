import { GraphNodeType } from '@noema/types';
import type {
  IAddNodeOperation,
  IMutationProposal,
  IUpdateNodeOperation,
} from '../../../../domain/knowledge-graph-service/ckg-mutation-dsl.js';
import type {
  ICanonicalNodeResolution,
  ICanonicalNodeResolutionResult,
  ICanonicalNodeResolver,
  IMutationPreviewGenerator,
  INormalizedOntologyConceptCandidate,
  INormalizedOntologyGraphBatch,
  INormalizedOntologyRelationCandidate,
  IOntologyMutationPreviewBatch,
  IOntologyMutationPreviewCandidate,
  OntologyMergeConflictKind,
} from '../../../../domain/knowledge-graph-service/ontology-imports.contracts.js';

const DEFAULT_PRIORITY = 10;
type SupportedEdgeType =
  | 'prerequisite'
  | 'part_of'
  | 'is_a'
  | 'related_to'
  | 'contradicts'
  | 'exemplifies'
  | 'causes'
  | 'derived_from';
const RELATION_BLOCK_REASON =
  'CKG edge mutations need canonical node ids for both ends. Resolve both concepts first, then the relation can enter the review queue.';
const MAPPING_KINDS_FOR_PROPAGATION = new Set(['exact_match', 'close_match']);
const BLOCKING_CONFLICTS = new Set<OntologyMergeConflictKind>([
  'ambiguous_match',
  'mapping_conflict',
]);

const SOURCE_DOMAINS: Record<string, string> = {
  yago: 'world-knowledge',
  esco: 'skills-and-occupations',
  conceptnet: 'commonsense',
};

const EDGE_TYPES_BY_PREDICATE: Record<string, SupportedEdgeType> = {
  prerequisite: 'prerequisite',
  part_of: 'part_of',
  is_a: 'is_a',
  related_to: 'related_to',
  contradicts: 'contradicts',
  exemplifies: 'exemplifies',
  causes: 'causes',
  derived_from: 'derived_from',
};

export class OntologyImportMutationGenerationService implements IMutationPreviewGenerator {
  constructor(private readonly canonicalNodeResolver?: ICanonicalNodeResolver) {}

  async generate(batch: INormalizedOntologyGraphBatch): Promise<IOntologyMutationPreviewBatch> {
    const directResolutions = await this.resolveConcepts(batch);
    const resolutions = propagateMappedResolutions(batch, directResolutions);
    const conceptCandidates = batch.concepts.map((concept) =>
      buildConceptCandidate(batch, concept, resolutions.get(concept.externalId) ?? unresolved())
    );
    const relationCandidates = batch.relations.map((relation) =>
      buildRelationCandidate(relation, resolutions)
    );
    const candidates = [...conceptCandidates, ...relationCandidates];
    const readyProposalCount = candidates.filter(
      (candidate) => candidate.status === 'ready'
    ).length;

    return {
      runId: batch.runId,
      sourceId: batch.sourceId,
      sourceVersion: batch.sourceVersion,
      generatedAt: new Date().toISOString(),
      artifactId: null,
      proposalCount: readyProposalCount,
      readyProposalCount,
      blockedCandidateCount: candidates.length - readyProposalCount,
      candidates,
    };
  }

  private async resolveConcepts(
    batch: INormalizedOntologyGraphBatch
  ): Promise<Map<string, ICanonicalNodeResolutionResult>> {
    const resolver = this.canonicalNodeResolver;
    if (resolver === undefined) {
      return new Map();
    }

    const resolutions = await Promise.all(
      batch.concepts.map(async (concept) => ({
        externalId: concept.externalId,
        resolution: normalizeResolutionResult(await resolver.resolveConcept(concept, batch)),
      }))
    );

    return new Map<string, ICanonicalNodeResolutionResult>(
      resolutions.map((entry) => [entry.externalId, entry.resolution])
    );
  }
}

function buildConceptCandidate(
  batch: INormalizedOntologyGraphBatch,
  concept: INormalizedOntologyConceptCandidate,
  resolutionResult: ICanonicalNodeResolutionResult
): IOntologyMutationPreviewCandidate {
  const sourceLabel = batch.sourceId.toUpperCase();
  const resolution = resolutionResult.resolution;

  if (resolution === null && hasBlockingConflicts(resolutionResult.conflictFlags)) {
    return {
      candidateId: `concept:${concept.externalId}`,
      entityKind: 'concept',
      status: 'blocked',
      title: `Review concept: ${concept.preferredLabel}`,
      summary: `Resolve conflicting canonical matches before importing ${sourceLabel} concept data.`,
      rationale: buildReviewMetadata(unresolved(), resolutionResult.conflictFlags),
      blockedReason: `Canonical resolution is ambiguous for this concept. Conflicts: ${formatConflictFlags(
        resolutionResult.conflictFlags
      )}.`,
      dependencyExternalIds: [],
      proposal: null,
    };
  }

  const proposal =
    resolution === null
      ? buildConceptAddProposal(batch, concept, resolutionResult.conflictFlags)
      : buildConceptEnrichmentProposal(batch, concept, resolution);

  return {
    candidateId: `concept:${concept.externalId}`,
    entityKind: 'concept',
    status: 'ready',
    title:
      resolution === null
        ? `Add concept: ${concept.preferredLabel}`
        : `Enrich concept: ${concept.preferredLabel}`,
    summary:
      resolution === null
        ? `Create a canonical node from ${sourceLabel}.`
        : `Update canonical node "${resolution.label}" with ${sourceLabel} provenance and aliases.`,
    rationale: proposal.rationale,
    blockedReason: null,
    dependencyExternalIds: [],
    proposal,
  };
}

function buildRelationCandidate(
  relation: INormalizedOntologyRelationCandidate,
  resolutions: Map<string, ICanonicalNodeResolutionResult>
): IOntologyMutationPreviewCandidate {
  const edgeType = EDGE_TYPES_BY_PREDICATE[relation.normalizedPredicate];
  const subjectResolution = resolutions.get(relation.subjectExternalId) ?? unresolved();
  const objectResolution = resolutions.get(relation.objectExternalId) ?? unresolved();

  if (edgeType === undefined) {
    return buildBlockedRelationCandidate(
      relation,
      `The normalized predicate "${relation.normalizedPredicate}" does not map to a CKG edge type yet.`
    );
  }

  if (
    subjectResolution.resolution === null ||
    objectResolution.resolution === null ||
    hasBlockingConflicts(subjectResolution.conflictFlags) ||
    hasBlockingConflicts(objectResolution.conflictFlags)
  ) {
    const missing = [
      ...(subjectResolution.resolution === null ? [relation.subjectExternalId] : []),
      ...(objectResolution.resolution === null ? [relation.objectExternalId] : []),
    ];
    const conflictFlags = dedupeConflictFlags([
      ...subjectResolution.conflictFlags,
      ...objectResolution.conflictFlags,
    ]);
    const unresolvedMessage =
      missing.length > 0 ? ` Unresolved endpoints: ${missing.join(', ')}.` : '';
    const conflictMessage =
      conflictFlags.length > 0 ? ` Conflicts: ${formatConflictFlags(conflictFlags)}.` : '';

    return buildBlockedRelationCandidate(
      relation,
      `${RELATION_BLOCK_REASON}${unresolvedMessage}${conflictMessage}`
    );
  }

  const proposal = buildRelationProposal(
    relation,
    subjectResolution.resolution,
    objectResolution.resolution,
    edgeType
  );

  return {
    candidateId: `relation:${relation.externalId}`,
    entityKind: 'relation',
    status: 'ready',
    title: `Add relation: ${relation.predicateLabel ?? relation.normalizedPredicate}`,
    summary: `${subjectResolution.resolution.label} ${relation.normalizedPredicate} ${objectResolution.resolution.label}`,
    rationale: proposal.rationale,
    blockedReason: null,
    dependencyExternalIds: [],
    proposal,
  };
}

function buildBlockedRelationCandidate(
  relation: INormalizedOntologyRelationCandidate,
  blockedReason: string
): IOntologyMutationPreviewCandidate {
  const summary = `${relation.subjectExternalId} ${relation.normalizedPredicate} ${relation.objectExternalId}`;

  return {
    candidateId: `relation:${relation.externalId}`,
    entityKind: 'relation',
    status: 'blocked',
    title: `Defer relation: ${relation.normalizedPredicate}`,
    summary,
    rationale:
      'Wait until both endpoints resolve against canonical CKG nodes before emitting add_edge mutations.',
    blockedReason,
    dependencyExternalIds: [relation.subjectExternalId, relation.objectExternalId],
    proposal: null,
  };
}

function buildConceptAddProposal(
  batch: INormalizedOntologyGraphBatch,
  concept: INormalizedOntologyConceptCandidate,
  conflictFlags: OntologyMergeConflictKind[]
): IMutationProposal {
  const importMetadata = buildImportMetadata(batch, `concept:${concept.externalId}`);
  const reviewMetadata = buildReviewMetadata(unresolved(), conflictFlags);
  const operation: IAddNodeOperation = {
    type: 'add_node',
    nodeType: inferNodeType(concept),
    label: concept.preferredLabel,
    description: concept.description ?? '',
    domain: inferDomain(batch.sourceId, concept),
    properties: {
      ontologyImport: buildOntologyImportProperties(batch, concept),
      ...concept.properties,
    } as IAddNodeOperation['properties'],
  };

  return {
    operations: [operation],
    rationale: `${importMetadata} ${reviewMetadata} Import "${concept.preferredLabel}" from ${batch.sourceId.toUpperCase()} as a canonical node with preserved provenance.`,
    evidenceCount: Math.max(concept.provenance.length, 1),
    priority: derivePriority(0.55, conflictFlags),
  };
}

function buildConceptEnrichmentProposal(
  batch: INormalizedOntologyGraphBatch,
  concept: INormalizedOntologyConceptCandidate,
  resolution: ICanonicalNodeResolution
): IMutationProposal {
  const importMetadata = buildImportMetadata(batch, `concept:${concept.externalId}`);
  const reviewMetadata = buildReviewMetadata(resolution, resolution.conflictFlags);
  const operation: IUpdateNodeOperation = {
    type: 'update_node',
    nodeId: resolution.nodeId,
    updates: {
      properties: {
        ontologyImportEnrichment: buildOntologyImportProperties(batch, concept),
      } as NonNullable<IUpdateNodeOperation['updates']['properties']>,
    },
    rationale: `${importMetadata} ${reviewMetadata} Enrich canonical node "${resolution.label}" with ontology import provenance from ${batch.sourceId.toUpperCase()}.`,
  };

  return {
    operations: [operation],
    rationale: `${importMetadata} ${reviewMetadata} Attach ${batch.sourceId.toUpperCase()} source metadata and aliases to existing canonical node "${resolution.label}".`,
    evidenceCount: Math.max(concept.provenance.length, 1),
    priority: derivePriority(resolution.confidenceScore, resolution.conflictFlags),
  };
}

function buildRelationProposal(
  relation: INormalizedOntologyRelationCandidate,
  subject: ICanonicalNodeResolution,
  object: ICanonicalNodeResolution,
  edgeType: SupportedEdgeType
): IMutationProposal {
  const importMetadata = buildImportMetadata(
    {
      runId: relation.provenance[0]?.runId ?? 'unknown-run',
      sourceId: relation.provenance[0]?.sourceId ?? 'unknown-source',
    },
    `relation:${relation.externalId}`
  );
  const combinedConfidence = Math.min(subject.confidenceScore, object.confidenceScore);
  const combinedConflicts = dedupeConflictFlags([
    ...subject.conflictFlags,
    ...object.conflictFlags,
  ]);
  const reviewMetadata = buildReviewMetadata(
    {
      ...subject,
      confidenceScore: combinedConfidence,
      confidenceBand:
        combinedConfidence >= 0.85 ? 'high' : combinedConfidence >= 0.6 ? 'medium' : 'low',
      conflictFlags: combinedConflicts,
    },
    combinedConflicts
  );
  const operation: Extract<IMutationProposal['operations'][number], { type: 'add_edge' }> = {
    type: 'add_edge',
    edgeType,
    sourceNodeId: subject.nodeId,
    targetNodeId: object.nodeId,
    weight: inferEdgeWeight(edgeType),
    rationale: `${importMetadata} ${reviewMetadata} Resolved relation endpoints to canonical nodes "${subject.label}" and "${object.label}".`,
  };

  return {
    operations: [operation],
    rationale: `${importMetadata} ${reviewMetadata} Import ${edgeType} relation between "${subject.label}" and "${object.label}" from normalized ontology evidence.`,
    evidenceCount: Math.max(relation.provenance.length, 1),
    priority: derivePriority(combinedConfidence, combinedConflicts),
  };
}

function buildOntologyImportProperties(
  batch: INormalizedOntologyGraphBatch,
  concept: INormalizedOntologyConceptCandidate
): Record<string, unknown> {
  return {
    sourceId: batch.sourceId,
    sourceVersion: batch.sourceVersion,
    runId: batch.runId,
    externalId: concept.externalId,
    iri: concept.iri,
    aliases: concept.aliases,
    languages: concept.languages,
    sourceTypes: concept.sourceTypes,
    provenance: concept.provenance.map((entry) => ({
      sourceId: entry.sourceId,
      sourceVersion: entry.sourceVersion,
      runId: entry.runId,
      artifactId: entry.artifactId,
      harvestedAt: entry.harvestedAt,
      license: entry.license,
      requestUrl: entry.requestUrl,
    })),
  };
}

function inferNodeType(
  concept: INormalizedOntologyConceptCandidate
): IAddNodeOperation['nodeType'] {
  if (concept.nodeKind === 'literal') {
    return GraphNodeType.FACT;
  }

  const lexicalSignals = [concept.preferredLabel, ...concept.sourceTypes].join(' ').toLowerCase();
  if (lexicalSignals.includes('misconception')) {
    return GraphNodeType.MISCONCEPTION;
  }
  if (lexicalSignals.includes('example')) {
    return GraphNodeType.EXAMPLE;
  }
  if (lexicalSignals.includes('principle') || lexicalSignals.includes('law')) {
    return GraphNodeType.PRINCIPLE;
  }
  if (lexicalSignals.includes('procedure') || lexicalSignals.includes('method')) {
    return GraphNodeType.PROCEDURE;
  }

  return GraphNodeType.CONCEPT;
}

function inferDomain(
  sourceId: INormalizedOntologyGraphBatch['sourceId'],
  concept: INormalizedOntologyConceptCandidate
): string {
  const propertyDomain =
    typeof concept.properties['domain'] === 'string' ? concept.properties['domain'].trim() : '';
  return propertyDomain !== '' ? propertyDomain : (SOURCE_DOMAINS[sourceId] ?? 'general');
}

function inferEdgeWeight(edgeType: SupportedEdgeType): number {
  switch (edgeType) {
    case 'prerequisite':
    case 'part_of':
    case 'is_a':
      return 1;
    case 'contradicts':
      return 0.9;
    case 'causes':
    case 'derived_from':
      return 0.8;
    default:
      return 0.7;
  }
}

function propagateMappedResolutions(
  batch: INormalizedOntologyGraphBatch,
  directResolutions: Map<string, ICanonicalNodeResolutionResult>
): Map<string, ICanonicalNodeResolutionResult> {
  const resolutions = new Map(directResolutions);
  let changed = true;

  while (changed) {
    changed = false;

    for (const mapping of batch.mappings) {
      if (!MAPPING_KINDS_FOR_PROPAGATION.has(mapping.mappingKind)) {
        continue;
      }

      if (mapping.confidenceBand === 'low' || hasBlockingConflicts(mapping.conflictFlags)) {
        continue;
      }

      const sourceResolution = resolutions.get(mapping.sourceExternalId) ?? unresolved();
      const targetResolution = resolutions.get(mapping.targetExternalId) ?? unresolved();

      if (sourceResolution.resolution !== null && targetResolution.resolution === null) {
        resolutions.set(mapping.targetExternalId, {
          resolution: {
            ...sourceResolution.resolution,
            strategy: 'mapping',
            confidenceScore: Math.min(
              sourceResolution.resolution.confidenceScore,
              mapping.confidenceScore
            ),
            confidenceBand:
              Math.min(sourceResolution.resolution.confidenceScore, mapping.confidenceScore) >= 0.85
                ? 'high'
                : Math.min(sourceResolution.resolution.confidenceScore, mapping.confidenceScore) >=
                    0.6
                  ? 'medium'
                  : 'low',
            conflictFlags: dedupeConflictFlags([
              ...sourceResolution.resolution.conflictFlags,
              ...mapping.conflictFlags,
            ]),
          },
          conflictFlags: dedupeConflictFlags([
            ...sourceResolution.conflictFlags,
            ...mapping.conflictFlags,
          ]),
        });
        changed = true;
      }

      if (targetResolution.resolution !== null && sourceResolution.resolution === null) {
        resolutions.set(mapping.sourceExternalId, {
          resolution: {
            ...targetResolution.resolution,
            strategy: 'mapping',
            confidenceScore: Math.min(
              targetResolution.resolution.confidenceScore,
              mapping.confidenceScore
            ),
            confidenceBand:
              Math.min(targetResolution.resolution.confidenceScore, mapping.confidenceScore) >= 0.85
                ? 'high'
                : Math.min(targetResolution.resolution.confidenceScore, mapping.confidenceScore) >=
                    0.6
                  ? 'medium'
                  : 'low',
            conflictFlags: dedupeConflictFlags([
              ...targetResolution.resolution.conflictFlags,
              ...mapping.conflictFlags,
            ]),
          },
          conflictFlags: dedupeConflictFlags([
            ...targetResolution.conflictFlags,
            ...mapping.conflictFlags,
          ]),
        });
        changed = true;
      }
    }
  }

  return resolutions;
}

function buildImportMetadata(
  batch: Pick<INormalizedOntologyGraphBatch, 'runId' | 'sourceId'>,
  candidateId: string
): string {
  return `[ontology-import runId=${batch.runId} sourceId=${batch.sourceId} candidateId=${candidateId}]`;
}

function buildReviewMetadata(
  resolution: ICanonicalNodeResolutionResult | ICanonicalNodeResolution,
  conflictFlags: OntologyMergeConflictKind[] | undefined
): string {
  const resolvedResolution = 'resolution' in resolution ? resolution.resolution : resolution;
  const confidenceScore = resolvedResolution?.confidenceScore ?? 0.55;
  const confidenceBand = resolvedResolution?.confidenceBand ?? 'medium';
  const resolvedConflicts = conflictFlags ?? [];
  const conflicts = resolvedConflicts.length > 0 ? resolvedConflicts.join('|') : 'none';

  return `[ontology-review confidence=${confidenceScore.toFixed(2)} band=${confidenceBand} conflicts=${conflicts}]`;
}

function derivePriority(
  confidenceScore: number,
  conflictFlags: OntologyMergeConflictKind[] | undefined
): number {
  if (hasBlockingConflicts(conflictFlags)) {
    return DEFAULT_PRIORITY + 8;
  }

  if (confidenceScore >= 0.9) {
    return DEFAULT_PRIORITY - 3;
  }

  if (confidenceScore >= 0.75) {
    return DEFAULT_PRIORITY - 1;
  }

  return DEFAULT_PRIORITY + 2;
}

function hasBlockingConflicts(conflictFlags: OntologyMergeConflictKind[] | undefined): boolean {
  return (conflictFlags ?? []).some((conflictFlag) => BLOCKING_CONFLICTS.has(conflictFlag));
}

function dedupeConflictFlags(
  conflictFlags: OntologyMergeConflictKind[]
): OntologyMergeConflictKind[] {
  return [...new Set(conflictFlags)];
}

function formatConflictFlags(conflictFlags: OntologyMergeConflictKind[]): string {
  return conflictFlags.join(', ');
}

function unresolved(): ICanonicalNodeResolutionResult {
  return {
    resolution: null,
    conflictFlags: [],
  };
}

function normalizeResolutionResult(
  value: ICanonicalNodeResolutionResult | ICanonicalNodeResolution | null
): ICanonicalNodeResolutionResult {
  if (value === null) {
    return unresolved();
  }

  if ('resolution' in value || ('conflictFlags' in value && !('nodeId' in value))) {
    const resolution = value.resolution;
    if (resolution === null) {
      return {
        resolution: null,
        conflictFlags: value.conflictFlags,
      };
    }

    return {
      resolution: {
        ...resolution,
        confidenceScore: resolution.confidenceScore,
        confidenceBand: resolution.confidenceBand,
        conflictFlags: resolution.conflictFlags,
      },
      conflictFlags: value.conflictFlags,
    };
  }

  return {
    resolution: {
      ...value,
      confidenceScore: value.confidenceScore,
      confidenceBand: value.confidenceBand,
      conflictFlags: value.conflictFlags,
    },
    conflictFlags: value.conflictFlags,
  };
}
