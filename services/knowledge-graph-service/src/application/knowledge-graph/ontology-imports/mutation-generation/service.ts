import { GraphEdgeType, GraphNodeType } from '@noema/types';
import type {
  IAddNodeOperation,
  IMutationProposal,
  IUpdateNodeOperation,
} from '../../../../domain/knowledge-graph-service/ckg-mutation-dsl.js';
import type {
  ICanonicalNodeResolution,
  ICanonicalNodeResolutionResult,
  ICanonicalNodeResolver,
  IEndpointResolutionStatus,
  IMutationPreviewGenerator,
  INormalizedOntologyConceptCandidate,
  INormalizedOntologyGraphBatch,
  INormalizedOntologyRelationCandidate,
  IOntologyImportReviewMetadata,
  IOntologyMutationPreviewBatch,
  IOntologyMutationPreviewCandidate,
  IRelationBlockingReason,
  IRelationInferenceReason,
  IResolvedRelationEndpoint,
  OntologyMergeConflictKind,
} from '../../../../domain/knowledge-graph-service/ontology-imports.contracts.js';
import { getEdgePolicy } from '../../../../domain/knowledge-graph-service/policies/edge-type-policies.js';

const DEFAULT_PRIORITY = 10;
const RELATION_BLOCK_REASON =
  'CKG edge mutations need canonical node ids for both ends. Resolve both concepts first, then the relation can enter the review queue.';
const MAPPING_KINDS_FOR_PROPAGATION = new Set(['exact_match', 'close_match']);
const BLOCKING_CONFLICTS = new Set<OntologyMergeConflictKind>([
  'ambiguous_match',
  'mapping_conflict',
]);
const QUALIFICATION_ACTION_LEADS = new Set([
  'act',
  'adapt',
  'administer',
  'advise',
  'analyse',
  'analyze',
  'apply',
  'assemble',
  'assess',
  'build',
  'calibrate',
  'coach',
  'code',
  'communicate',
  'compile',
  'conduct',
  'configure',
  'coordinate',
  'create',
  'deliver',
  'design',
  'develop',
  'diagnose',
  'document',
  'draft',
  'evaluate',
  'execute',
  'facilitate',
  'follow',
  'guide',
  'implement',
  'inspect',
  'install',
  'interpret',
  'lead',
  'maintain',
  'manage',
  'model',
  'monitor',
  'negotiate',
  'operate',
  'optimise',
  'optimize',
  'perform',
  'plan',
  'prepare',
  'present',
  'program',
  'repair',
  'report',
  'research',
  'review',
  'solve',
  'support',
  'teach',
  'test',
  'troubleshoot',
  'use',
  'validate',
  'write',
]);

const SOURCE_DOMAINS: Record<string, string> = {
  yago: 'world-knowledge',
  esco: 'skills-and-occupations',
  conceptnet: 'commonsense',
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
      buildRelationCandidate(relation, batch, resolutions)
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
    const review = buildReviewSummary(unresolved(), resolutionResult.conflictFlags);
    return {
      candidateId: `concept:${concept.externalId}`,
      entityKind: 'concept',
      status: 'blocked',
      title: `Review concept: ${concept.preferredLabel}`,
      summary: `Resolve conflicting canonical matches before importing ${sourceLabel} concept data.`,
      rationale: buildReviewMetadata(review),
      review,
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
  const review = proposal.review;

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
    review,
    blockedReason: null,
    dependencyExternalIds: [],
    proposal,
  };
}

function buildRelationCandidate(
  relation: INormalizedOntologyRelationCandidate,
  _batch: INormalizedOntologyGraphBatch,
  resolutions: Map<string, ICanonicalNodeResolutionResult>
): IOntologyMutationPreviewCandidate {
  const subjectResolution = resolutions.get(relation.subjectExternalId) ?? unresolved();
  const objectResolution = resolutions.get(relation.objectExternalId) ?? unresolved();
  const relationMapping = inferRelationMapping(relation, subjectResolution, objectResolution);
  const endpointResolution = buildEndpointResolutionStatus(
    relation,
    subjectResolution,
    objectResolution
  );
  const evidenceSummary = buildRelationEvidenceSummary(relation);

  if (
    relationMapping.selectedEdgeType === null ||
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
    const mappingMessage = relationMapping.blockingReasons.some(
      (reason) => reason.code === 'predicate_unmapped'
    )
      ? ` The normalized predicate "${relation.normalizedPredicate}" does not map to a CKG edge type yet.`
      : '';

    const review = buildReviewSummary(
      {
        resolution: null,
        conflictFlags,
      },
      conflictFlags
    );
    review.reviewState =
      missing.length > 0 || conflictFlags.length > 0 ? 'endpoint_unresolved' : 'blocked';
    review.notes = [
      ...relationMapping.inferenceReasons.map((reason) => reason.message),
      ...relationMapping.blockingReasons.map((reason) => reason.message),
    ];
    return buildBlockedRelationCandidate(
      relation,
      `${RELATION_BLOCK_REASON}${unresolvedMessage}${conflictMessage}${mappingMessage}`,
      review,
      relationMapping,
      endpointResolution,
      evidenceSummary
    );
  }

  const proposal = buildRelationProposal(
    relation,
    subjectResolution.resolution,
    objectResolution.resolution,
    relationMapping.selectedEdgeType
  );

  const review = proposal.review;
  review.reviewState = 'ready';
  review.notes = relationMapping.inferenceReasons.map((reason) => reason.message);
  return {
    candidateId: `relation:${relation.externalId}`,
    entityKind: 'relation',
    status: 'ready',
    title: `Add relation: ${relation.predicateLabel ?? relation.normalizedPredicate}`,
    summary: `${subjectResolution.resolution.label} ${relation.normalizedPredicate} ${objectResolution.resolution.label}`,
    rationale: proposal.rationale,
    review,
    sourceRelationType: relationMapping.sourceRelationType,
    candidateEdgeTypes: relationMapping.candidateEdgeTypes,
    selectedEdgeType: relationMapping.selectedEdgeType,
    endpointResolution,
    inferenceReasons: relationMapping.inferenceReasons,
    blockingReasons: relationMapping.blockingReasons,
    evidenceSummary,
    blockedReason: null,
    dependencyExternalIds: [relation.subjectExternalId, relation.objectExternalId],
    proposal,
  };
}

function buildBlockedRelationCandidate(
  relation: INormalizedOntologyRelationCandidate,
  blockedReason: string,
  review: IOntologyImportReviewMetadata,
  relationMapping: ReturnType<typeof inferRelationMapping>,
  endpointResolution: ReturnType<typeof buildEndpointResolutionStatus>,
  evidenceSummary: string[]
): IOntologyMutationPreviewCandidate {
  const summary = `${relation.subjectExternalId} ${relation.normalizedPredicate} ${relation.objectExternalId}`;

  return {
    candidateId: `relation:${relation.externalId}`,
    entityKind: 'relation',
    status: 'blocked',
    title: `Defer relation: ${relation.normalizedPredicate}`,
    summary,
    rationale: buildReviewMetadata(review),
    review,
    sourceRelationType: relationMapping.sourceRelationType,
    candidateEdgeTypes: relationMapping.candidateEdgeTypes,
    selectedEdgeType: relationMapping.selectedEdgeType,
    endpointResolution,
    inferenceReasons: relationMapping.inferenceReasons,
    blockingReasons: relationMapping.blockingReasons,
    evidenceSummary,
    blockedReason,
    dependencyExternalIds: [relation.subjectExternalId, relation.objectExternalId],
    proposal: null,
  };
}

function buildConceptAddProposal(
  batch: INormalizedOntologyGraphBatch,
  concept: INormalizedOntologyConceptCandidate,
  conflictFlags: OntologyMergeConflictKind[]
): IMutationProposal & { review: IOntologyImportReviewMetadata } {
  const importMetadata = buildImportMetadata(batch, `concept:${concept.externalId}`);
  const review = buildReviewSummary(unresolved(), conflictFlags);
  const reviewMetadata = buildReviewMetadata(review);
  const sourceCoverage = buildSourceCoverage(batch, concept);
  const nodeTypeInference = inferNodeType(concept);
  const operation: IAddNodeOperation = {
    type: 'add_node',
    nodeType: nodeTypeInference.nodeType,
    label: concept.preferredLabel,
    description: concept.description ?? '',
    domain: inferDomain(batch.sourceId, concept),
    status: 'active',
    aliases: concept.aliases,
    languages: concept.languages,
    tags: buildConceptTags(batch, concept),
    semanticHints: buildConceptSemanticHints(concept),
    canonicalExternalRefs: buildCanonicalExternalRefs(batch, concept),
    ontologyMappings: buildOntologyMappingsForConcept(batch, concept),
    provenance: buildNodeProvenance(concept),
    reviewMetadata: {
      ...review,
      reviewState: 'ready',
      notes: [
        `Imported from ${batch.sourceId.toUpperCase()} concept normalization pipeline.`,
        ...nodeTypeInference.reviewNotes,
      ],
    },
    sourceCoverage,
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
    review,
  };
}

function buildConceptEnrichmentProposal(
  batch: INormalizedOntologyGraphBatch,
  concept: INormalizedOntologyConceptCandidate,
  resolution: ICanonicalNodeResolution
): IMutationProposal & { review: IOntologyImportReviewMetadata } {
  const importMetadata = buildImportMetadata(batch, `concept:${concept.externalId}`);
  const review = buildReviewSummary(resolution, resolution.conflictFlags);
  const reviewMetadata = buildReviewMetadata(review);
  const sourceCoverage = buildSourceCoverage(batch, concept);
  const nodeTypeInference = inferNodeType(concept);
  const operation: IUpdateNodeOperation = {
    type: 'update_node',
    nodeId: resolution.nodeId,
    updates: {
      aliases: concept.aliases,
      languages: concept.languages,
      tags: buildConceptTags(batch, concept),
      semanticHints: buildConceptSemanticHints(concept),
      canonicalExternalRefs: buildCanonicalExternalRefs(batch, concept),
      ontologyMappings: buildOntologyMappingsForConcept(batch, concept),
      provenance: buildNodeProvenance(concept),
      reviewMetadata: {
        ...review,
        reviewState: 'ready',
        notes: [
          `Enriched from ${batch.sourceId.toUpperCase()} ontology import evidence.`,
          ...nodeTypeInference.reviewNotes,
        ],
      },
      sourceCoverage,
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
    review,
  };
}

function buildRelationProposal(
  relation: INormalizedOntologyRelationCandidate,
  subject: ICanonicalNodeResolution,
  object: ICanonicalNodeResolution,
  edgeType: GraphEdgeType
): IMutationProposal & { review: IOntologyImportReviewMetadata } {
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
  const review = buildReviewSummary(
    {
      ...subject,
      confidenceScore: combinedConfidence,
      confidenceBand:
        combinedConfidence >= 0.85 ? 'high' : combinedConfidence >= 0.6 ? 'medium' : 'low',
      conflictFlags: combinedConflicts,
    },
    combinedConflicts
  );
  const reviewMetadata = buildReviewMetadata(review);
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
    review,
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

function inferNodeType(concept: INormalizedOntologyConceptCandidate): {
  nodeType: IAddNodeOperation['nodeType'];
  reviewNotes: string[];
} {
  if (concept.nodeKind === 'literal') {
    return { nodeType: GraphNodeType.FACT, reviewNotes: [] };
  }

  const lexicalSignals = [concept.preferredLabel, ...concept.sourceTypes].join(' ').toLowerCase();
  const className =
    typeof concept.properties['className'] === 'string'
      ? concept.properties['className'].toLowerCase()
      : '';
  const identifierSignals = [concept.externalId, concept.iri ?? ''].join(' ').toLowerCase();
  const hasSkillLinks =
    typeof concept.properties['_links'] === 'object' &&
    concept.properties['_links'] !== null &&
    Object.prototype.hasOwnProperty.call(concept.properties['_links'], 'hasSkillType');
  const isOccupation =
    className === 'occupation' ||
    lexicalSignals.includes('occupation') ||
    identifierSignals.includes('/occupation/') ||
    identifierSignals.includes('/isco/');
  const isQualification =
    className === 'qualification' ||
    lexicalSignals.includes('qualification') ||
    identifierSignals.includes('/qualification/') ||
    identifierSignals.includes('qualifications');

  if (isOccupation) {
    return { nodeType: GraphNodeType.OCCUPATION, reviewNotes: [] };
  }
  if (isQualification) {
    return inferQualificationNodeType(concept.preferredLabel);
  }

  if (lexicalSignals.includes('skill') || className === 'skill' || hasSkillLinks) {
    return { nodeType: GraphNodeType.SKILL, reviewNotes: [] };
  }
  if (lexicalSignals.includes('misconception')) {
    return { nodeType: GraphNodeType.MISCONCEPTION, reviewNotes: [] };
  }
  if (lexicalSignals.includes('example')) {
    return { nodeType: GraphNodeType.EXAMPLE, reviewNotes: [] };
  }
  if (lexicalSignals.includes('principle') || lexicalSignals.includes('law')) {
    return { nodeType: GraphNodeType.PRINCIPLE, reviewNotes: [] };
  }
  if (lexicalSignals.includes('procedure') || lexicalSignals.includes('method')) {
    return { nodeType: GraphNodeType.PROCEDURE, reviewNotes: [] };
  }

  return { nodeType: GraphNodeType.CONCEPT, reviewNotes: [] };
}

function inferQualificationNodeType(label: string): {
  nodeType: IAddNodeOperation['nodeType'];
  reviewNotes: string[];
} {
  const normalized = label.trim().toLowerCase();
  const firstToken = normalized.split(/[\s/-]+/u)[0] ?? '';
  const competencyPhrase =
    normalized.startsWith('ability to ') ||
    normalized.startsWith('able to ') ||
    normalized.startsWith('capacity to ') ||
    normalized.startsWith('competence in ') ||
    normalized.startsWith('competency in ');
  const actionLike = competencyPhrase || QUALIFICATION_ACTION_LEADS.has(firstToken);

  if (actionLike) {
    return {
      nodeType: GraphNodeType.SKILL,
      reviewNotes: [
        `Qualification heuristic mapped "${label}" to skill because the label reads as action-led or competency-like.`,
      ],
    };
  }

  return {
    nodeType: GraphNodeType.CONCEPT,
    reviewNotes: [
      `Qualification heuristic mapped "${label}" to concept because the label was not confidently action-led.`,
      'Reviewer confirmation recommended for this qualification classification.',
    ],
  };
}

function inferDomain(
  sourceId: INormalizedOntologyGraphBatch['sourceId'],
  concept: INormalizedOntologyConceptCandidate
): string {
  const propertyDomain =
    typeof concept.properties['domain'] === 'string' ? concept.properties['domain'].trim() : '';
  return propertyDomain !== '' ? propertyDomain : (SOURCE_DOMAINS[sourceId] ?? 'general');
}

function inferEdgeWeight(edgeType: GraphEdgeType): number {
  switch (edgeType) {
    case GraphEdgeType.PREREQUISITE:
    case GraphEdgeType.PART_OF:
    case GraphEdgeType.IS_A:
    case GraphEdgeType.EQUIVALENT_TO:
    case GraphEdgeType.SUBSKILL_OF:
    case GraphEdgeType.HAS_SUBSKILL:
    case GraphEdgeType.ESSENTIAL_FOR_OCCUPATION:
    case GraphEdgeType.OCCUPATION_REQUIRES_ESSENTIAL_SKILL:
      return 1;
    case GraphEdgeType.CONTRADICTS:
    case GraphEdgeType.DISJOINT_WITH:
    case GraphEdgeType.DEPENDS_ON:
    case GraphEdgeType.OPTIONAL_FOR_OCCUPATION:
    case GraphEdgeType.OCCUPATION_BENEFITS_FROM_OPTIONAL_SKILL:
    case GraphEdgeType.TRANSFERABLE_TO:
      return 0.8;
    case GraphEdgeType.CAUSES:
    case GraphEdgeType.DERIVED_FROM:
    case GraphEdgeType.HAS_PROPERTY:
    case GraphEdgeType.ENTAILS:
      return 0.8;
    case GraphEdgeType.CONFUSABLE_WITH:
      return 0.6;
    default:
      return 0.7;
  }
}

function buildConceptTags(
  batch: INormalizedOntologyGraphBatch,
  concept: INormalizedOntologyConceptCandidate
): string[] {
  return dedupeStrings([inferDomain(batch.sourceId, concept), ...concept.sourceTypes]);
}

function buildConceptSemanticHints(concept: INormalizedOntologyConceptCandidate): string[] {
  const className =
    typeof concept.properties['className'] === 'string' ? concept.properties['className'] : null;
  const conceptType =
    typeof concept.properties['conceptType'] === 'string'
      ? concept.properties['conceptType']
      : null;

  return dedupeStrings([
    concept.nodeKind,
    ...concept.sourceTypes,
    ...(className !== null ? [className] : []),
    ...(conceptType !== null ? [conceptType] : []),
  ]);
}

function buildCanonicalExternalRefs(
  batch: INormalizedOntologyGraphBatch,
  concept: INormalizedOntologyConceptCandidate
): NonNullable<IAddNodeOperation['canonicalExternalRefs']> {
  return [
    {
      sourceId: batch.sourceId,
      externalId: concept.externalId,
      iri: concept.iri,
      refType: concept.nodeKind,
      sourceVersion: batch.sourceVersion,
      isCanonical: true,
      confidenceScore: 1,
    },
  ];
}

function buildOntologyMappingsForConcept(
  batch: INormalizedOntologyGraphBatch,
  concept: INormalizedOntologyConceptCandidate
): NonNullable<IAddNodeOperation['ontologyMappings']> {
  return batch.mappings
    .filter((mapping) => mapping.sourceExternalId === concept.externalId)
    .map((mapping) => ({
      sourceId: batch.sourceId,
      externalId: mapping.externalId,
      mappingKind: mapping.mappingKind,
      targetExternalId: mapping.targetExternalId,
      confidenceScore: mapping.confidenceScore,
      confidenceBand: mapping.confidenceBand,
      conflictFlags: mapping.conflictFlags,
    }));
}

function buildNodeProvenance(
  concept: INormalizedOntologyConceptCandidate
): NonNullable<IAddNodeOperation['provenance']> {
  return concept.provenance.map((entry) => ({
    sourceId: entry.sourceId,
    sourceVersion: entry.sourceVersion,
    runId: entry.runId,
    artifactId: entry.artifactId,
    harvestedAt: entry.harvestedAt,
    license: entry.license,
    requestUrl: entry.requestUrl,
    recordKind: 'concept',
  }));
}

function buildSourceCoverage(
  batch: INormalizedOntologyGraphBatch,
  concept: INormalizedOntologyConceptCandidate
): NonNullable<IAddNodeOperation['sourceCoverage']> {
  const backboneSources = new Set(['yago', 'esco', 'conceptnet', 'unesco', 'wordnet']);
  const contributingSourceIds = dedupeStrings([
    batch.sourceId,
    ...concept.provenance.map((entry) => entry.sourceId),
  ]);

  return {
    contributingSourceIds,
    sourceCount: contributingSourceIds.length,
    hasBackboneSource: contributingSourceIds.some((sourceId) => backboneSources.has(sourceId)),
    hasEnhancementSource: contributingSourceIds.some((sourceId) => !backboneSources.has(sourceId)),
    lastEnrichedAt: concept.provenance.at(-1)?.harvestedAt ?? batch.generatedAt,
  };
}

function buildEndpointResolutionStatus(
  relation: INormalizedOntologyRelationCandidate,
  subjectResolution: ICanonicalNodeResolutionResult,
  objectResolution: ICanonicalNodeResolutionResult
): IEndpointResolutionStatus {
  return {
    subject: buildResolvedEndpoint('subject', relation.subjectExternalId, subjectResolution),
    object: buildResolvedEndpoint('object', relation.objectExternalId, objectResolution),
  };
}

function buildResolvedEndpoint(
  role: 'subject' | 'object',
  externalId: string,
  resolution: ICanonicalNodeResolutionResult
): IResolvedRelationEndpoint {
  if (resolution.resolution === null) {
    return {
      role,
      externalId,
      status: hasBlockingConflicts(resolution.conflictFlags) ? 'ambiguous' : 'unresolved',
      canonicalNodeId: null,
      canonicalLabel: null,
      canonicalNodeType: null,
      domain: null,
      strategy: null,
      confidenceScore: null,
      confidenceBand: null,
      conflictFlags: resolution.conflictFlags,
      blockingReasons: buildEndpointBlockingReasons(resolution),
    };
  }

  return {
    role,
    externalId,
    status: 'resolved',
    canonicalNodeId: resolution.resolution.nodeId,
    canonicalLabel: resolution.resolution.label,
    canonicalNodeType: resolution.resolution.nodeType,
    domain: resolution.resolution.domain,
    strategy: resolution.resolution.strategy,
    confidenceScore: resolution.resolution.confidenceScore,
    confidenceBand: resolution.resolution.confidenceBand,
    conflictFlags: resolution.resolution.conflictFlags,
    blockingReasons: buildEndpointBlockingReasons(resolution),
  };
}

function buildEndpointBlockingReasons(resolution: ICanonicalNodeResolutionResult): string[] {
  if (resolution.resolution !== null && resolution.conflictFlags.length === 0) {
    return [];
  }

  if (resolution.conflictFlags.length > 0) {
    return resolution.conflictFlags.map(
      (flag) => `Resolution conflict detected: ${flag.replaceAll('_', ' ')}`
    );
  }

  return ['Canonical endpoint has not been resolved yet.'];
}

function normalizeRelationSignal(signal: string): string {
  return signal
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function hasAnyRelationSignal(
  signals: ReadonlySet<string>,
  expectedSignals: readonly string[]
): boolean {
  return expectedSignals.some((signal) => signals.has(signal));
}

function inferRelationMapping(
  relation: INormalizedOntologyRelationCandidate,
  subjectResolution: ICanonicalNodeResolutionResult,
  objectResolution: ICanonicalNodeResolutionResult
): {
  sourceRelationType: string;
  candidateEdgeTypes: GraphEdgeType[];
  selectedEdgeType: GraphEdgeType | null;
  inferenceReasons: IRelationInferenceReason[];
  blockingReasons: IRelationBlockingReason[];
} {
  const inferenceReasons: IRelationInferenceReason[] = [];
  const blockingReasons: IRelationBlockingReason[] = [];
  const sourceId = relation.provenance[0]?.sourceId ?? null;
  const sourceRelationType = relation.sourcePredicates[0] ?? relation.normalizedPredicate;
  const relationSignals = new Set(
    [relation.normalizedPredicate, ...relation.sourcePredicates].map(normalizeRelationSignal)
  );
  let candidateEdgeTypes: GraphEdgeType[] = [];

  if (hasAnyRelationSignal(relationSignals, ['broader_skill'])) {
    candidateEdgeTypes = [GraphEdgeType.SUBSKILL_OF];
    inferenceReasons.push({
      code: 'hierarchy_signal',
      message: 'The source predicate expresses a broader-skill hierarchy relation.',
      sourceField: sourceRelationType,
      evidence: relation.predicateLabel,
      confidenceDelta: 0.24,
    });
  } else if (hasAnyRelationSignal(relationSignals, ['narrower_skill'])) {
    candidateEdgeTypes = [GraphEdgeType.HAS_SUBSKILL];
    inferenceReasons.push({
      code: 'hierarchy_signal',
      message: 'The source predicate expresses a narrower-skill hierarchy relation.',
      sourceField: sourceRelationType,
      evidence: relation.predicateLabel,
      confidenceDelta: 0.24,
    });
  } else if (
    hasAnyRelationSignal(relationSignals, [
      'same_as',
      'sameas',
      'exact_match',
      'close_match',
      'broad_match',
      'narrow_match',
      'related_match',
      'synonym',
    ])
  ) {
    blockingReasons.push({
      code: 'mapping_relation_requires_anchoring',
      message:
        'The source predicate expresses cross-source identity, mapping, or lexical equivalence. Keep it as ontology mapping or alias evidence instead of auto-promoting it to a canonical edge.',
      blocking: true,
      detail: sourceRelationType,
    });
  } else if (
    hasAnyRelationSignal(relationSignals, [
      'is_a',
      'subclass_of',
      'sub_class_of',
      'instance_of',
      'type',
      'broader_concept',
      'broader_occupation',
      'broader_taxonomy',
      'narrower_concept',
      'narrower_occupation',
      'narrower_taxonomy',
    ])
  ) {
    candidateEdgeTypes = [GraphEdgeType.IS_A];
    inferenceReasons.push({
      code: 'taxonomy_signal',
      message:
        sourceId === 'yago'
          ? 'The YAGO predicate expresses taxonomy or type membership, so it is treated as a canonical taxonomy hint first.'
          : 'The source predicate expresses taxonomy or type membership, so it is treated as a canonical taxonomy hint.',
      sourceField: sourceRelationType,
      evidence: relation.predicateLabel,
      confidenceDelta: 0.24,
    });
  } else if (hasAnyRelationSignal(relationSignals, ['part_of', 'has_part', 'component_of'])) {
    candidateEdgeTypes = [GraphEdgeType.PART_OF];
    inferenceReasons.push({
      code: 'mereology_signal',
      message: 'The predicate encodes a part-whole relation.',
      sourceField: sourceRelationType,
      evidence: relation.predicateLabel,
      confidenceDelta: 0.2,
    });
  } else if (
    hasAnyRelationSignal(relationSignals, [
      'constituted_by',
      'composed_of',
      'consists_of',
      'made_of',
    ])
  ) {
    candidateEdgeTypes = [GraphEdgeType.CONSTITUTED_BY];
    inferenceReasons.push({
      code: 'constitution_signal',
      message: 'The predicate expresses a constitutive or compositional relation.',
      sourceField: sourceRelationType,
      evidence: relation.predicateLabel,
      confidenceDelta: 0.22,
    });
  } else if (
    hasAnyRelationSignal(relationSignals, [
      'has_essential_skill',
      'is_essential_for_occupation',
      'essential_skill_for_occupation',
    ])
  ) {
    candidateEdgeTypes = [
      GraphEdgeType.ESSENTIAL_FOR_OCCUPATION,
      GraphEdgeType.OCCUPATION_REQUIRES_ESSENTIAL_SKILL,
    ];
    inferenceReasons.push({
      code: 'essential_skill_signal',
      message: 'The predicate expresses an essential occupation-skill dependency.',
      sourceField: sourceRelationType,
      evidence: relation.predicateLabel,
      confidenceDelta: 0.3,
    });
  } else if (
    hasAnyRelationSignal(relationSignals, [
      'has_optional_skill',
      'is_optional_for_occupation',
      'optional_skill_for_occupation',
    ])
  ) {
    candidateEdgeTypes = [
      GraphEdgeType.OPTIONAL_FOR_OCCUPATION,
      GraphEdgeType.OCCUPATION_BENEFITS_FROM_OPTIONAL_SKILL,
    ];
    inferenceReasons.push({
      code: 'optional_skill_signal',
      message: 'The predicate expresses an optional occupation-skill association.',
      sourceField: sourceRelationType,
      evidence: relation.predicateLabel,
      confidenceDelta: 0.18,
    });
  } else if (
    hasAnyRelationSignal(relationSignals, ['has_skill_type', 'skill_type', 'has_property'])
  ) {
    candidateEdgeTypes = [GraphEdgeType.HAS_PROPERTY, GraphEdgeType.RELATED_TO];
    inferenceReasons.push({
      code: 'property_signal',
      message: 'The predicate behaves like a source-specific property or typing attribute.',
      sourceField: sourceRelationType,
      evidence: relation.predicateLabel,
      confidenceDelta: 0.15,
    });
  } else if (hasAnyRelationSignal(relationSignals, ['example_of', 'exemplifies'])) {
    candidateEdgeTypes = [GraphEdgeType.EXEMPLIFIES];
    inferenceReasons.push({
      code: 'example_signal',
      message: 'The predicate presents one concept as an example of another.',
      sourceField: sourceRelationType,
      evidence: relation.predicateLabel,
      confidenceDelta: 0.2,
    });
  } else if (hasAnyRelationSignal(relationSignals, ['equivalent_to', 'equivalent_class'])) {
    candidateEdgeTypes = [GraphEdgeType.EQUIVALENT_TO];
    inferenceReasons.push({
      code: 'equivalence_signal',
      message:
        'The predicate expresses semantic equivalence rather than cross-source identity mapping.',
      sourceField: sourceRelationType,
      evidence: relation.predicateLabel,
      confidenceDelta: 0.25,
    });
  } else if (hasAnyRelationSignal(relationSignals, ['entails', 'implies'])) {
    candidateEdgeTypes = [GraphEdgeType.ENTAILS];
    inferenceReasons.push({
      code: 'entailment_signal',
      message: 'The predicate expresses logical implication or entailment.',
      sourceField: sourceRelationType,
      evidence: relation.predicateLabel,
      confidenceDelta: 0.25,
    });
  } else if (hasAnyRelationSignal(relationSignals, ['disjoint_with', 'distinct_from'])) {
    candidateEdgeTypes = [GraphEdgeType.DISJOINT_WITH];
    inferenceReasons.push({
      code: 'disjoint_signal',
      message: 'The predicate expresses mutual exclusion or disjointness.',
      sourceField: sourceRelationType,
      evidence: relation.predicateLabel,
      confidenceDelta: 0.24,
    });
  } else if (hasAnyRelationSignal(relationSignals, ['analogous_to', 'similar_to', 'analogy'])) {
    candidateEdgeTypes = [GraphEdgeType.ANALOGOUS_TO];
    inferenceReasons.push({
      code: 'analogy_signal',
      message: 'The predicate indicates analogy or strong structural similarity.',
      sourceField: sourceRelationType,
      evidence: relation.predicateLabel,
      confidenceDelta: 0.16,
    });
  } else if (hasAnyRelationSignal(relationSignals, ['contrasts_with', 'antonym', 'opposite_of'])) {
    candidateEdgeTypes = [GraphEdgeType.CONTRASTS_WITH];
    inferenceReasons.push({
      code: 'contrast_signal',
      message: 'The predicate expresses a contrastive or oppositional relation.',
      sourceField: sourceRelationType,
      evidence: relation.predicateLabel,
      confidenceDelta: 0.16,
    });
  } else if (
    hasAnyRelationSignal(relationSignals, [
      'related_to',
      'related_concept',
      'related_skill',
      'related_occupation',
      'used_for',
      'capable_of',
      'at_location',
    ])
  ) {
    candidateEdgeTypes = [GraphEdgeType.RELATED_TO];
    inferenceReasons.push({
      code: 'associative_signal',
      message: 'The predicate indicates a general associative relation.',
      sourceField: sourceRelationType,
      evidence: relation.predicateLabel,
      confidenceDelta: 0.1,
    });
  } else if (hasAnyRelationSignal(relationSignals, ['contradicts'])) {
    candidateEdgeTypes = [GraphEdgeType.CONTRADICTS];
    inferenceReasons.push({
      code: 'contradiction_signal',
      message: 'The predicate is already a direct contradiction relation.',
      sourceField: sourceRelationType,
      evidence: relation.predicateLabel,
      confidenceDelta: 0.25,
    });
  } else if (hasAnyRelationSignal(relationSignals, ['causes'])) {
    candidateEdgeTypes = [GraphEdgeType.CAUSES];
    inferenceReasons.push({
      code: 'causal_signal',
      message: 'The predicate expresses a causal relationship.',
      sourceField: sourceRelationType,
      evidence: relation.predicateLabel,
      confidenceDelta: 0.25,
    });
  } else if (hasAnyRelationSignal(relationSignals, ['derived_from'])) {
    candidateEdgeTypes = [GraphEdgeType.DERIVED_FROM];
    inferenceReasons.push({
      code: 'derivation_signal',
      message: 'The predicate expresses a derivation chain.',
      sourceField: sourceRelationType,
      evidence: relation.predicateLabel,
      confidenceDelta: 0.22,
    });
  } else if (hasAnyRelationSignal(relationSignals, ['precedes', 'before'])) {
    candidateEdgeTypes = [GraphEdgeType.PRECEDES];
    inferenceReasons.push({
      code: 'ordering_signal',
      message: 'The predicate expresses temporal or logical ordering.',
      sourceField: sourceRelationType,
      evidence: relation.predicateLabel,
      confidenceDelta: 0.18,
    });
  } else {
    blockingReasons.push({
      code: 'predicate_unmapped',
      message: `The normalized predicate "${relation.normalizedPredicate}" is not mapped to a canonical edge repertoire yet.`,
      blocking: true,
      detail: relation.sourcePredicates.join(', '),
    });
  }

  const subjectType = (subjectResolution.resolution?.nodeType ?? null) as GraphNodeType | null;
  const objectType = (objectResolution.resolution?.nodeType ?? null) as GraphNodeType | null;
  if (subjectType !== null && objectType !== null && candidateEdgeTypes.length > 0) {
    const compatibleEdgeTypes = candidateEdgeTypes.filter((edgeType) => {
      const policy = getEdgePolicy(edgeType);
      return (
        policy.allowedSourceTypes.includes(subjectType) &&
        policy.allowedTargetTypes.includes(objectType)
      );
    });

    if (compatibleEdgeTypes.length !== candidateEdgeTypes.length) {
      inferenceReasons.push({
        code: 'policy_filter',
        message:
          'Filtered candidate edge types against canonical node-type policy before marking the relation as ready.',
        sourceField: null,
        evidence: `${subjectType} -> ${objectType}`,
        confidenceDelta: 0.05,
      });
    }

    if (compatibleEdgeTypes.length === 0) {
      blockingReasons.push({
        code: 'policy_incompatible',
        message: `Resolved endpoint types '${subjectType}' -> '${objectType}' are incompatible with the inferred candidate edge repertoire.`,
        blocking: true,
        detail:
          relation.sourcePredicates.length > 0
            ? relation.sourcePredicates.join(', ')
            : relation.normalizedPredicate,
      });
    }

    candidateEdgeTypes = compatibleEdgeTypes;
  }

  const selectedEdgeType =
    candidateEdgeTypes.length === 0
      ? null
      : choosePreferredEdgeType(candidateEdgeTypes, subjectResolution, objectResolution);

  if (candidateEdgeTypes.length > 1 && selectedEdgeType !== null) {
    inferenceReasons.push({
      code: 'candidate_selection',
      message: `Selected ${selectedEdgeType} as the current best-fit canonical edge type from the candidate set.`,
      sourceField: null,
      evidence: relation.normalizedPredicate,
      confidenceDelta: 0.05,
    });
  }

  return {
    sourceRelationType,
    candidateEdgeTypes,
    selectedEdgeType,
    inferenceReasons,
    blockingReasons,
  };
}

function choosePreferredEdgeType(
  candidateEdgeTypes: GraphEdgeType[],
  subjectResolution: ICanonicalNodeResolutionResult,
  objectResolution: ICanonicalNodeResolutionResult
): GraphEdgeType | null {
  if (candidateEdgeTypes.length === 0) {
    return null;
  }

  const subjectType = subjectResolution.resolution?.nodeType ?? null;
  const objectType = objectResolution.resolution?.nodeType ?? null;

  if (
    candidateEdgeTypes.includes(GraphEdgeType.SUBSKILL_OF) &&
    subjectType === GraphNodeType.SKILL &&
    objectType === GraphNodeType.SKILL
  ) {
    return GraphEdgeType.SUBSKILL_OF;
  }

  if (
    candidateEdgeTypes.includes(GraphEdgeType.HAS_SUBSKILL) &&
    subjectType === GraphNodeType.SKILL &&
    objectType === GraphNodeType.SKILL
  ) {
    return GraphEdgeType.HAS_SUBSKILL;
  }

  if (
    candidateEdgeTypes.includes(GraphEdgeType.IS_A) &&
    (subjectType === GraphNodeType.CONCEPT || subjectType === GraphNodeType.OCCUPATION) &&
    (objectType === GraphNodeType.CONCEPT || objectType === GraphNodeType.OCCUPATION)
  ) {
    return GraphEdgeType.IS_A;
  }

  if (
    candidateEdgeTypes.includes(GraphEdgeType.ESSENTIAL_FOR_OCCUPATION) &&
    subjectType === GraphNodeType.SKILL &&
    objectType === GraphNodeType.OCCUPATION
  ) {
    return GraphEdgeType.ESSENTIAL_FOR_OCCUPATION;
  }

  if (
    candidateEdgeTypes.includes(GraphEdgeType.OCCUPATION_REQUIRES_ESSENTIAL_SKILL) &&
    subjectType === GraphNodeType.OCCUPATION &&
    objectType === GraphNodeType.SKILL
  ) {
    return GraphEdgeType.OCCUPATION_REQUIRES_ESSENTIAL_SKILL;
  }

  if (
    candidateEdgeTypes.includes(GraphEdgeType.OPTIONAL_FOR_OCCUPATION) &&
    subjectType === GraphNodeType.SKILL &&
    objectType === GraphNodeType.OCCUPATION
  ) {
    return GraphEdgeType.OPTIONAL_FOR_OCCUPATION;
  }

  if (
    candidateEdgeTypes.includes(GraphEdgeType.OCCUPATION_BENEFITS_FROM_OPTIONAL_SKILL) &&
    subjectType === GraphNodeType.OCCUPATION &&
    objectType === GraphNodeType.SKILL
  ) {
    return GraphEdgeType.OCCUPATION_BENEFITS_FROM_OPTIONAL_SKILL;
  }

  if (
    candidateEdgeTypes.includes(GraphEdgeType.HAS_PROPERTY) &&
    (objectType === GraphNodeType.FACT ||
      objectType === GraphNodeType.PRINCIPLE ||
      objectType === GraphNodeType.CONCEPT)
  ) {
    return GraphEdgeType.HAS_PROPERTY;
  }

  if (
    candidateEdgeTypes.includes(GraphEdgeType.DEPENDS_ON) &&
    (subjectType === GraphNodeType.CONCEPT ||
      subjectType === GraphNodeType.SKILL ||
      subjectType === GraphNodeType.PROCEDURE ||
      subjectType === GraphNodeType.PRINCIPLE)
  ) {
    return GraphEdgeType.DEPENDS_ON;
  }

  return candidateEdgeTypes[0] ?? null;
}

function buildRelationEvidenceSummary(relation: INormalizedOntologyRelationCandidate): string[] {
  const provenanceSummary = relation.provenance[0];
  return [
    `Normalized predicate: ${relation.normalizedPredicate}`,
    ...(relation.sourcePredicates.length > 0
      ? [`Source predicates: ${relation.sourcePredicates.join(', ')}`]
      : []),
    ...(relation.predicateLabel !== null ? [`Predicate label: ${relation.predicateLabel}`] : []),
    ...(provenanceSummary?.sourceId !== undefined
      ? [`Origin: ${provenanceSummary.sourceId} run ${provenanceSummary.runId}`]
      : []),
  ];
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value !== ''))];
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

function buildReviewSummary(
  resolution: ICanonicalNodeResolutionResult | ICanonicalNodeResolution,
  conflictFlags: OntologyMergeConflictKind[] | undefined
): IOntologyImportReviewMetadata {
  const resolvedResolution = 'resolution' in resolution ? resolution.resolution : resolution;
  return {
    confidenceScore: resolvedResolution?.confidenceScore ?? 0.55,
    confidenceBand: resolvedResolution?.confidenceBand ?? 'medium',
    conflictFlags: conflictFlags ?? [],
  };
}

function buildReviewMetadata(review: IOntologyImportReviewMetadata): string {
  const conflicts = review.conflictFlags.length > 0 ? review.conflictFlags.join('|') : 'none';
  return `[ontology-review confidence=${review.confidenceScore.toFixed(2)} band=${review.confidenceBand} conflicts=${conflicts}]`;
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
