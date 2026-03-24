import { GraphNodeType } from '@noema/types';
import type {
  IAddNodeOperation,
  IMutationProposal,
  IUpdateNodeOperation,
} from '../../../../domain/knowledge-graph-service/ckg-mutation-dsl.js';
import type {
  ICanonicalNodeResolution,
  ICanonicalNodeResolver,
  IMutationPreviewGenerator,
  INormalizedOntologyConceptCandidate,
  INormalizedOntologyGraphBatch,
  INormalizedOntologyRelationCandidate,
  IOntologyMutationPreviewBatch,
  IOntologyMutationPreviewCandidate,
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
      buildConceptCandidate(batch, concept, resolutions.get(concept.externalId) ?? null)
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
  ): Promise<Map<string, ICanonicalNodeResolution>> {
    if (this.canonicalNodeResolver === undefined) {
      return new Map();
    }

    const resolutions = await Promise.all(
      batch.concepts.map(async (concept) => ({
        externalId: concept.externalId,
        resolution: await this.canonicalNodeResolver?.resolveConcept(concept, batch),
      }))
    );

    return new Map<string, ICanonicalNodeResolution>(
      resolutions
        .filter(
          (entry): entry is { externalId: string; resolution: ICanonicalNodeResolution } =>
            entry.resolution !== null && entry.resolution !== undefined
        )
        .map((entry) => [entry.externalId, entry.resolution])
    );
  }
}

function buildConceptCandidate(
  batch: INormalizedOntologyGraphBatch,
  concept: INormalizedOntologyConceptCandidate,
  resolution: ICanonicalNodeResolution | null
): IOntologyMutationPreviewCandidate {
  const proposal =
    resolution === null
      ? buildConceptAddProposal(batch, concept)
      : buildConceptEnrichmentProposal(batch, concept, resolution);
  const sourceLabel = batch.sourceId.toUpperCase();

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
  resolutions: Map<string, ICanonicalNodeResolution>
): IOntologyMutationPreviewCandidate {
  const edgeType = EDGE_TYPES_BY_PREDICATE[relation.normalizedPredicate];
  const subjectResolution = resolutions.get(relation.subjectExternalId) ?? null;
  const objectResolution = resolutions.get(relation.objectExternalId) ?? null;

  if (edgeType === undefined) {
    return buildBlockedRelationCandidate(
      relation,
      `The normalized predicate "${relation.normalizedPredicate}" does not map to a CKG edge type yet.`
    );
  }

  if (subjectResolution === null || objectResolution === null) {
    const missing = [
      ...(subjectResolution === null ? [relation.subjectExternalId] : []),
      ...(objectResolution === null ? [relation.objectExternalId] : []),
    ];
    return buildBlockedRelationCandidate(
      relation,
      `${RELATION_BLOCK_REASON} Unresolved endpoints: ${missing.join(', ')}.`
    );
  }

  const proposal = buildRelationProposal(relation, subjectResolution, objectResolution, edgeType);

  return {
    candidateId: `relation:${relation.externalId}`,
    entityKind: 'relation',
    status: 'ready',
    title: `Add relation: ${relation.predicateLabel ?? relation.normalizedPredicate}`,
    summary: `${subjectResolution.label} ${relation.normalizedPredicate} ${objectResolution.label}`,
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
  concept: INormalizedOntologyConceptCandidate
): IMutationProposal {
  const importMetadata = buildImportMetadata(batch, `concept:${concept.externalId}`);
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
    rationale: `${importMetadata} Import "${concept.preferredLabel}" from ${batch.sourceId.toUpperCase()} as a canonical node with preserved provenance.`,
    evidenceCount: Math.max(concept.provenance.length, 1),
    priority: DEFAULT_PRIORITY,
  };
}

function buildConceptEnrichmentProposal(
  batch: INormalizedOntologyGraphBatch,
  concept: INormalizedOntologyConceptCandidate,
  resolution: ICanonicalNodeResolution
): IMutationProposal {
  const importMetadata = buildImportMetadata(batch, `concept:${concept.externalId}`);
  const operation: IUpdateNodeOperation = {
    type: 'update_node',
    nodeId: resolution.nodeId,
    updates: {
      properties: {
        ontologyImportEnrichment: buildOntologyImportProperties(batch, concept),
      } as NonNullable<IUpdateNodeOperation['updates']['properties']>,
    },
    rationale: `${importMetadata} Enrich canonical node "${resolution.label}" with ontology import provenance from ${batch.sourceId.toUpperCase()}.`,
  };

  return {
    operations: [operation],
    rationale: `${importMetadata} Attach ${batch.sourceId.toUpperCase()} source metadata and aliases to existing canonical node "${resolution.label}".`,
    evidenceCount: Math.max(concept.provenance.length, 1),
    priority: DEFAULT_PRIORITY,
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
  const operation: Extract<IMutationProposal['operations'][number], { type: 'add_edge' }> = {
    type: 'add_edge',
    edgeType,
    sourceNodeId: subject.nodeId,
    targetNodeId: object.nodeId,
    weight: inferEdgeWeight(edgeType),
    rationale: `${importMetadata} Resolved relation endpoints to canonical nodes "${subject.label}" and "${object.label}".`,
  };

  return {
    operations: [operation],
    rationale: `${importMetadata} Import ${edgeType} relation between "${subject.label}" and "${object.label}" from normalized ontology evidence.`,
    evidenceCount: Math.max(relation.provenance.length, 1),
    priority: DEFAULT_PRIORITY,
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
  directResolutions: Map<string, ICanonicalNodeResolution>
): Map<string, ICanonicalNodeResolution> {
  const resolutions = new Map(directResolutions);
  let changed = true;

  while (changed) {
    changed = false;

    for (const mapping of batch.mappings) {
      if (!MAPPING_KINDS_FOR_PROPAGATION.has(mapping.mappingKind)) {
        continue;
      }

      const sourceResolution = resolutions.get(mapping.sourceExternalId);
      const targetResolution = resolutions.get(mapping.targetExternalId);

      if (sourceResolution !== undefined && targetResolution === undefined) {
        resolutions.set(mapping.targetExternalId, {
          ...sourceResolution,
          strategy: 'mapping',
        });
        changed = true;
      }

      if (targetResolution !== undefined && sourceResolution === undefined) {
        resolutions.set(mapping.sourceExternalId, {
          ...targetResolution,
          strategy: 'mapping',
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
