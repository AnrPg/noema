import { describe, expect, it } from 'vitest';
import { OntologyImportMutationGenerationService } from '../../../src/application/knowledge-graph/ontology-imports/mutation-generation/index.js';
import type {
  ICanonicalNodeResolver,
  INormalizedOntologyGraphBatch,
} from '../../../src/domain/knowledge-graph-service/ontology-imports.contracts.js';

function createBatch(): INormalizedOntologyGraphBatch {
  return {
    runId: 'run_test_001',
    sourceId: 'yago',
    sourceVersion: '4.5.0.2',
    generatedAt: '2026-03-24T12:00:00.000Z',
    rawRecordCount: 5,
    conceptCount: 2,
    relationCount: 1,
    mappingCount: 1,
    concepts: [
      {
        externalId: 'https://yago-knowledge.org/resource/Leonhard_Euler',
        iri: 'https://yago-knowledge.org/resource/Leonhard_Euler',
        nodeKind: 'entity',
        preferredLabel: 'Leonhard Euler',
        aliases: ['Euler'],
        description: 'Swiss mathematician and physicist.',
        languages: ['en'],
        sourceTypes: ['person'],
        properties: {},
        provenance: [
          {
            sourceId: 'yago',
            sourceVersion: '4.5.0.2',
            runId: 'run_test_001',
            artifactId: 'artifact_001',
            harvestedAt: '2026-03-24T12:00:00.000Z',
            license: null,
            requestUrl: null,
          },
        ],
      },
      {
        externalId: 'https://yago-knowledge.org/resource/Mathematics',
        iri: 'https://yago-knowledge.org/resource/Mathematics',
        nodeKind: 'concept',
        preferredLabel: 'Mathematics',
        aliases: ['Math'],
        description: 'Field of study.',
        languages: ['en'],
        sourceTypes: ['discipline'],
        properties: {},
        provenance: [
          {
            sourceId: 'yago',
            sourceVersion: '4.5.0.2',
            runId: 'run_test_001',
            artifactId: 'artifact_001',
            harvestedAt: '2026-03-24T12:00:00.000Z',
            license: null,
            requestUrl: null,
          },
        ],
      },
    ],
    relations: [
      {
        externalId: 'relation_001',
        iri: null,
        normalizedPredicate: 'related_to',
        predicateLabel: 'related to',
        subjectExternalId: 'https://yago-knowledge.org/resource/Leonhard_Euler',
        objectExternalId: 'https://yago-knowledge.org/resource/Mathematics',
        direction: 'directed',
        sourcePredicates: ['http://schema.org/relatedTo'],
        properties: {},
        provenance: [
          {
            sourceId: 'yago',
            sourceVersion: '4.5.0.2',
            runId: 'run_test_001',
            artifactId: 'artifact_002',
            harvestedAt: '2026-03-24T12:00:00.000Z',
            license: null,
            requestUrl: null,
          },
        ],
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
        provenance: [
          {
            sourceId: 'yago',
            sourceVersion: '4.5.0.2',
            runId: 'run_test_001',
            artifactId: 'artifact_003',
            harvestedAt: '2026-03-24T12:00:00.000Z',
            license: null,
            requestUrl: null,
          },
        ],
      },
    ],
  };
}

function createMappedRelationBatch(): INormalizedOntologyGraphBatch {
  const batch = createBatch();
  return {
    ...batch,
    relations: [
      {
        ...batch.relations[0],
        subjectExternalId: 'https://example.org/entity/Euler',
      },
    ],
  };
}

class StubCanonicalNodeResolver implements ICanonicalNodeResolver {
  resolveConcept(concept: { preferredLabel: string }) {
    if (concept.preferredLabel === 'Leonhard Euler') {
      return Promise.resolve({
        resolution: {
          nodeId: 'node_euler',
          label: 'Leonhard Euler',
          nodeType: 'concept',
          domain: 'world-knowledge',
          strategy: 'label',
          confidenceScore: 0.76,
          confidenceBand: 'medium',
          conflictFlags: [],
        },
        conflictFlags: [],
      });
    }

    if (concept.preferredLabel === 'Mathematics') {
      return Promise.resolve({
        resolution: {
          nodeId: 'node_mathematics',
          label: 'Mathematics',
          nodeType: 'concept',
          domain: 'world-knowledge',
          strategy: 'label',
          confidenceScore: 0.76,
          confidenceBand: 'medium',
          conflictFlags: [],
        },
        conflictFlags: [],
      });
    }

    return Promise.resolve({
      resolution: null,
      conflictFlags: [],
    });
  }
}

describe('OntologyImportMutationGenerationService', () => {
  it('builds canonical-node enrichments and resolved add-edge proposals', async () => {
    const service = new OntologyImportMutationGenerationService(new StubCanonicalNodeResolver());

    const preview = await service.generate(createBatch());

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
              }),
            ],
          }),
        }),
      ])
    );
  });

  it('uses exact mappings to resolve deferred relation endpoints into add-edge proposals', async () => {
    const service = new OntologyImportMutationGenerationService(new StubCanonicalNodeResolver());

    const preview = await service.generate(createMappedRelationBatch());
    const relationCandidate = preview.candidates.find(
      (candidate) => candidate.entityKind === 'relation'
    );

    expect(relationCandidate).toEqual(
      expect.objectContaining({
        status: 'ready',
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
});
