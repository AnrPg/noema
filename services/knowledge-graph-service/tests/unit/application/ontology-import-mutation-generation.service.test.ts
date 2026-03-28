import { describe, expect, it } from 'vitest';

import { GraphEdgeType, GraphNodeType } from '@noema/types';

import { OntologyImportMutationGenerationService } from '../../../src/application/knowledge-graph/ontology-imports/mutation-generation/index.js';
import type {
  ICanonicalNodeResolver,
  INormalizedOntologyConceptCandidate,
  INormalizedOntologyGraphBatch,
  INormalizedOntologyRelationCandidate,
} from '../../../src/domain/knowledge-graph-service/ontology-imports.contracts.js';

function createProvenance(sourceId = 'yago') {
  return {
    sourceId,
    sourceVersion: sourceId === 'esco' ? 'v1.2.0' : '4.5.0.2',
    runId: 'run_test_001',
    artifactId: 'artifact_001',
    harvestedAt: '2026-03-24T12:00:00.000Z',
    license: null,
    requestUrl: null,
  };
}

function createConcept(
  externalId: string,
  preferredLabel: string,
  options: Partial<INormalizedOntologyConceptCandidate> = {}
): INormalizedOntologyConceptCandidate {
  return {
    externalId,
    iri: externalId,
    nodeKind: 'concept',
    preferredLabel,
    aliases: [],
    description: null,
    languages: ['en'],
    sourceTypes: [],
    properties: {},
    provenance: [createProvenance()],
    ...options,
  };
}

function createRelation(
  externalId: string,
  normalizedPredicate: string,
  subjectExternalId: string,
  objectExternalId: string,
  options: Partial<INormalizedOntologyRelationCandidate> = {}
): INormalizedOntologyRelationCandidate {
  return {
    externalId,
    iri: null,
    normalizedPredicate,
    predicateLabel: normalizedPredicate.replace(/_/gu, ' '),
    subjectExternalId,
    objectExternalId,
    direction: 'directed',
    sourcePredicates: [normalizedPredicate],
    properties: {},
    provenance: [createProvenance()],
    ...options,
  };
}

function createBatch(
  concepts: INormalizedOntologyConceptCandidate[],
  relations: INormalizedOntologyRelationCandidate[],
  sourceId: INormalizedOntologyGraphBatch['sourceId'] = 'yago'
): INormalizedOntologyGraphBatch {
  return {
    runId: 'run_test_001',
    sourceId,
    sourceVersion: sourceId === 'esco' ? 'v1.2.0' : '4.5.0.2',
    generatedAt: '2026-03-24T12:00:00.000Z',
    rawRecordCount: concepts.length + relations.length,
    conceptCount: concepts.length,
    relationCount: relations.length,
    mappingCount: 0,
    concepts: concepts.map((concept) => ({
      ...concept,
      provenance: concept.provenance.map((entry) => ({ ...entry, sourceId })),
    })),
    relations: relations.map((relation) => ({
      ...relation,
      provenance: relation.provenance.map((entry) => ({ ...entry, sourceId })),
    })),
    mappings: [],
  };
}

function createMappedRelationBatch(): INormalizedOntologyGraphBatch {
  return {
    ...createBaseBatch(),
    relations: [
      {
        ...createBaseBatch().relations[0],
        subjectExternalId: 'https://example.org/entity/Euler',
      },
    ],
    mappings: [
      {
        externalId: 'mapping_001',
        sourceExternalId: 'https://example.org/entity/Euler',
        targetExternalId: 'https://yago-knowledge.org/resource/Leonhard_Euler',
        mappingKind: 'exact_match',
        confidenceScore: 0.96,
        confidenceBand: 'high',
        conflictFlags: [],
        provenance: [createProvenance()],
      },
    ],
  };
}

function createBaseBatch(): INormalizedOntologyGraphBatch {
  return createBatch(
    [
      createConcept('https://yago-knowledge.org/resource/Leonhard_Euler', 'Leonhard Euler', {
        aliases: ['Euler'],
        description: 'Swiss mathematician and physicist.',
        sourceTypes: ['person'],
      }),
      createConcept('https://yago-knowledge.org/resource/Mathematics', 'Mathematics', {
        aliases: ['Math'],
        description: 'Field of study.',
        sourceTypes: ['discipline'],
      }),
    ],
    [
      createRelation(
        'relation_001',
        'related_to',
        'https://yago-knowledge.org/resource/Leonhard_Euler',
        'https://yago-knowledge.org/resource/Mathematics',
        {
          predicateLabel: 'related to',
          sourcePredicates: ['http://schema.org/relatedTo'],
        }
      ),
    ],
    'yago'
  );
}

class MapCanonicalNodeResolver implements ICanonicalNodeResolver {
  constructor(
    private readonly entries: Record<
      string,
      {
        nodeId: string;
        nodeType: GraphNodeType;
        domain?: string;
      }
    >
  ) {}

  resolveConcept(concept: { preferredLabel: string }) {
    const entry = this.entries[concept.preferredLabel];
    if (entry === undefined) {
      return Promise.resolve({
        resolution: null,
        conflictFlags: [],
      });
    }

    return Promise.resolve({
      resolution: {
        nodeId: entry.nodeId,
        label: concept.preferredLabel,
        nodeType: entry.nodeType,
        domain: entry.domain ?? 'world-knowledge',
        strategy: 'label',
        confidenceScore: 0.76,
        confidenceBand: 'medium',
        conflictFlags: [],
      },
      conflictFlags: [],
    });
  }
}

function getReadyRelationCandidate(
  preview: Awaited<ReturnType<OntologyImportMutationGenerationService['generate']>>
) {
  const candidate = preview.candidates.find(
    (entry) => entry.entityKind === 'relation' && entry.status === 'ready'
  );
  expect(candidate).toBeDefined();
  return candidate!;
}

function getReadyConceptCandidate(
  preview: Awaited<ReturnType<OntologyImportMutationGenerationService['generate']>>,
  preferredLabel: string
) {
  const candidate = preview.candidates.find(
    (entry) =>
      entry.entityKind === 'concept' &&
      entry.status === 'ready' &&
      entry.title.endsWith(preferredLabel)
  );
  expect(candidate).toBeDefined();
  return candidate!;
}

describe('OntologyImportMutationGenerationService', () => {
  it('builds canonical-node enrichments and resolved add-edge proposals', async () => {
    const service = new OntologyImportMutationGenerationService(
      new MapCanonicalNodeResolver({
        'Leonhard Euler': { nodeId: 'node_euler', nodeType: GraphNodeType.CONCEPT },
        Mathematics: { nodeId: 'node_mathematics', nodeType: GraphNodeType.CONCEPT },
      })
    );

    const preview = await service.generate(createBaseBatch());

    expect(preview.readyProposalCount).toBe(3);
    expect(preview.blockedCandidateCount).toBe(0);
    expect(preview.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityKind: 'concept',
          status: 'ready',
          proposal: expect.objectContaining({
            operations: [expect.objectContaining({ type: 'update_node', nodeId: 'node_euler' })],
          }),
        }),
        expect.objectContaining({
          entityKind: 'relation',
          status: 'ready',
          proposal: expect.objectContaining({
            rationale: expect.stringMatching(
              /\[ontology-import runId=run_test_001 sourceId=yago.*\[ontology-review confidence=/u
            ),
            operations: [
              expect.objectContaining({
                type: 'add_edge',
                sourceNodeId: 'node_euler',
                targetNodeId: 'node_mathematics',
                edgeType: GraphEdgeType.RELATED_TO,
              }),
            ],
          }),
        }),
      ])
    );
  });

  it('uses exact mappings to resolve deferred relation endpoints into add-edge proposals', async () => {
    const service = new OntologyImportMutationGenerationService(
      new MapCanonicalNodeResolver({
        'Leonhard Euler': { nodeId: 'node_euler', nodeType: GraphNodeType.CONCEPT },
        Mathematics: { nodeId: 'node_mathematics', nodeType: GraphNodeType.CONCEPT },
      })
    );

    const preview = await service.generate(createMappedRelationBatch());
    const relationCandidate = getReadyRelationCandidate(preview);

    expect(relationCandidate).toEqual(
      expect.objectContaining({
        proposal: expect.objectContaining({
          operations: [
            expect.objectContaining({
              type: 'add_edge',
              sourceNodeId: 'node_euler',
              targetNodeId: 'node_mathematics',
            }),
          ],
        }),
      })
    );
  });

  it('maps broader_skill relations to subskill_of with full weight', async () => {
    const skillBatch = createBatch(
      [
        createConcept('esco:skill:python', 'Python programming', {
          sourceTypes: ['skill'],
          properties: { className: 'skill' },
        }),
        createConcept('esco:skill:programming', 'Programming', {
          sourceTypes: ['skill'],
          properties: { className: 'skill' },
        }),
      ],
      [
        createRelation(
          'esco-edge:1',
          'broader_skill',
          'esco:skill:python',
          'esco:skill:programming'
        ),
      ],
      'esco'
    );

    const service = new OntologyImportMutationGenerationService(
      new MapCanonicalNodeResolver({
        'Python programming': { nodeId: 'node_python', nodeType: GraphNodeType.SKILL },
        Programming: { nodeId: 'node_programming', nodeType: GraphNodeType.SKILL },
      })
    );

    const preview = await service.generate(skillBatch);
    const relationCandidate = getReadyRelationCandidate(preview);
    const operation = relationCandidate.proposal?.operations[0];

    expect(relationCandidate.selectedEdgeType).toBe(GraphEdgeType.SUBSKILL_OF);
    expect(operation).toEqual(
      expect.objectContaining({
        type: 'add_edge',
        edgeType: GraphEdgeType.SUBSKILL_OF,
        weight: 1,
      })
    );
  });

  it('treats YAGO instance and subclass predicates as taxonomy-only canonical candidates', async () => {
    const batch = createBatch(
      [
        createConcept('yago:Euler', 'Leonhard Euler', {
          nodeKind: 'entity',
          sourceTypes: ['yago_instance'],
          properties: { yagoResourceKind: 'instance' },
        }),
        createConcept('yago:Mathematician', 'Mathematician', {
          nodeKind: 'concept',
          sourceTypes: ['yago_class'],
          properties: { yagoResourceKind: 'class' },
        }),
      ],
      [createRelation('yago-edge:1', 'instance_of', 'yago:Euler', 'yago:Mathematician')],
      'yago'
    );

    const service = new OntologyImportMutationGenerationService(
      new MapCanonicalNodeResolver({
        'Leonhard Euler': { nodeId: 'node_euler', nodeType: GraphNodeType.CONCEPT },
        Mathematician: { nodeId: 'node_mathematician', nodeType: GraphNodeType.CONCEPT },
      })
    );

    const preview = await service.generate(batch);
    const relationCandidate = getReadyRelationCandidate(preview);

    expect(relationCandidate.candidateEdgeTypes).toEqual([GraphEdgeType.IS_A]);
    expect(relationCandidate.selectedEdgeType).toBe(GraphEdgeType.IS_A);
    expect(relationCandidate.inferenceReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'taxonomy_signal',
        }),
      ])
    );
  });

  it('keeps same_as style relations blocked for mapping review instead of auto-promoting them to equivalent_to', async () => {
    const batch = createBatch(
      [
        createConcept('yago:Euler', 'Leonhard Euler'),
        createConcept('wikidata:Q927', 'Leonhard Euler (Wikidata)'),
      ],
      [createRelation('yago-edge:mapping', 'same_as', 'yago:Euler', 'wikidata:Q927')],
      'yago'
    );

    const service = new OntologyImportMutationGenerationService(
      new MapCanonicalNodeResolver({
        'Leonhard Euler': { nodeId: 'node_euler', nodeType: GraphNodeType.CONCEPT },
        'Leonhard Euler (Wikidata)': {
          nodeId: 'node_euler_wikidata',
          nodeType: GraphNodeType.CONCEPT,
        },
      })
    );

    const preview = await service.generate(batch);
    const relationCandidate = preview.candidates.find((entry) => entry.entityKind === 'relation');

    expect(relationCandidate).toEqual(
      expect.objectContaining({
        status: 'blocked',
        selectedEdgeType: null,
        candidateEdgeTypes: [],
        blockingReasons: expect.arrayContaining([
          expect.objectContaining({
            code: 'mapping_relation_requires_anchoring',
          }),
        ]),
      })
    );
  });

  it('maps essential skill relations to skill -> occupation edges', async () => {
    const batch = createBatch(
      [
        createConcept('esco:skill:troubleshooting', 'Troubleshooting', {
          sourceTypes: ['skill'],
          properties: { className: 'skill' },
        }),
        createConcept('esco:occupation:technician', 'Maintenance technician', {
          sourceTypes: ['occupation'],
          properties: { className: 'occupation' },
        }),
      ],
      [
        createRelation(
          'esco-edge:essential',
          'has_essential_skill',
          'esco:skill:troubleshooting',
          'esco:occupation:technician'
        ),
      ],
      'esco'
    );

    const service = new OntologyImportMutationGenerationService(
      new MapCanonicalNodeResolver({
        Troubleshooting: { nodeId: 'node_troubleshooting', nodeType: GraphNodeType.SKILL },
        'Maintenance technician': {
          nodeId: 'node_technician',
          nodeType: GraphNodeType.OCCUPATION,
        },
      })
    );

    const preview = await service.generate(batch);
    const relationCandidate = getReadyRelationCandidate(preview);
    const operation = relationCandidate.proposal?.operations[0];

    expect(relationCandidate.selectedEdgeType).toBe(GraphEdgeType.ESSENTIAL_FOR_OCCUPATION);
    expect(operation).toEqual(
      expect.objectContaining({
        type: 'add_edge',
        edgeType: GraphEdgeType.ESSENTIAL_FOR_OCCUPATION,
        weight: 1,
      })
    );
  });

  it('maps optional skill relations to occupation -> skill edges when the endpoints resolve that way', async () => {
    const batch = createBatch(
      [
        createConcept('esco:occupation:analyst', 'Data analyst', {
          sourceTypes: ['occupation'],
          properties: { className: 'occupation' },
        }),
        createConcept('esco:skill:python', 'Python programming', {
          sourceTypes: ['skill'],
          properties: { className: 'skill' },
        }),
      ],
      [
        createRelation(
          'esco-edge:optional',
          'has_optional_skill',
          'esco:occupation:analyst',
          'esco:skill:python'
        ),
      ],
      'esco'
    );

    const service = new OntologyImportMutationGenerationService(
      new MapCanonicalNodeResolver({
        'Data analyst': { nodeId: 'node_analyst', nodeType: GraphNodeType.OCCUPATION },
        'Python programming': { nodeId: 'node_python', nodeType: GraphNodeType.SKILL },
      })
    );

    const preview = await service.generate(batch);
    const relationCandidate = getReadyRelationCandidate(preview);
    const operation = relationCandidate.proposal?.operations[0];

    expect(relationCandidate.selectedEdgeType).toBe(
      GraphEdgeType.OCCUPATION_BENEFITS_FROM_OPTIONAL_SKILL
    );
    expect(operation).toEqual(
      expect.objectContaining({
        type: 'add_edge',
        edgeType: GraphEdgeType.OCCUPATION_BENEFITS_FROM_OPTIONAL_SKILL,
        weight: 0.8,
      })
    );
  });

  it('classifies occupation concepts as occupation nodes during add-node proposals', async () => {
    const batch = createBatch(
      [
        createConcept('esco:occupation:nurse', 'Registered nurse', {
          sourceTypes: ['occupation'],
          properties: { className: 'occupation' },
        }),
      ],
      [],
      'esco'
    );

    const service = new OntologyImportMutationGenerationService(new MapCanonicalNodeResolver({}));
    const preview = await service.generate(batch);
    const conceptCandidate = getReadyConceptCandidate(preview, 'Registered nurse');
    const operation = conceptCandidate.proposal?.operations[0];

    expect(operation).toEqual(
      expect.objectContaining({
        type: 'add_node',
        nodeType: GraphNodeType.OCCUPATION,
      })
    );
  });

  it('maps action-led qualifications to skill nodes and records the heuristic note', async () => {
    const batch = createBatch(
      [
        createConcept('esco:qualification:diagnose', 'Ability to diagnose faults', {
          sourceTypes: ['qualification'],
          properties: { className: 'qualification' },
        }),
      ],
      [],
      'esco'
    );

    const service = new OntologyImportMutationGenerationService(new MapCanonicalNodeResolver({}));
    const preview = await service.generate(batch);
    const conceptCandidate = getReadyConceptCandidate(preview, 'Ability to diagnose faults');
    const operation = conceptCandidate.proposal?.operations[0];

    expect(operation).toEqual(
      expect.objectContaining({
        type: 'add_node',
        nodeType: GraphNodeType.SKILL,
      })
    );
    expect((operation as { reviewMetadata?: { notes?: string[] } }).reviewMetadata?.notes).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'Qualification heuristic mapped "Ability to diagnose faults" to skill'
        ),
      ])
    );
  });

  it('maps non-action-led qualifications to concept nodes and flags reviewer confirmation', async () => {
    const batch = createBatch(
      [
        createConcept('esco:qualification:certificate', 'Level 4 safety certificate', {
          sourceTypes: ['qualification'],
          properties: { className: 'qualification' },
        }),
      ],
      [],
      'esco'
    );

    const service = new OntologyImportMutationGenerationService(new MapCanonicalNodeResolver({}));
    const preview = await service.generate(batch);
    const conceptCandidate = getReadyConceptCandidate(preview, 'Level 4 safety certificate');
    const operation = conceptCandidate.proposal?.operations[0];

    expect(operation).toEqual(
      expect.objectContaining({
        type: 'add_node',
        nodeType: GraphNodeType.CONCEPT,
      })
    );
    expect((operation as { reviewMetadata?: { notes?: string[] } }).reviewMetadata?.notes).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'Qualification heuristic mapped "Level 4 safety certificate" to concept'
        ),
        'Reviewer confirmation recommended for this qualification classification.',
      ])
    );
  });
});
