import { describe, expect, it } from 'vitest';
import type { IGraphNode } from '@noema/types';
import { GraphCanonicalNodeResolver } from '../../../src/application/knowledge-graph/ontology-imports/mutation-generation/index.js';
import type {
  INormalizedOntologyConceptCandidate,
  INormalizedOntologyGraphBatch,
} from '../../../src/domain/knowledge-graph-service/ontology-imports.contracts.js';
import type { INodeRepository } from '../../../src/domain/knowledge-graph-service/graph.repository.js';

function createConcept(): INormalizedOntologyConceptCandidate {
  return {
    externalId: 'https://example.org/concept/graph-theory',
    iri: 'https://example.org/concept/graph-theory',
    nodeKind: 'concept',
    preferredLabel: 'Graph Theory',
    aliases: ['graph_theory', 'Theory of Graphs'],
    description: 'Study of graphs.',
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
  };
}

function createBatch(): INormalizedOntologyGraphBatch {
  return {
    runId: 'run_test_001',
    sourceId: 'yago',
    sourceVersion: '4.5.0.2',
    generatedAt: '2026-03-24T12:00:00.000Z',
    rawRecordCount: 1,
    conceptCount: 1,
    relationCount: 0,
    mappingCount: 1,
    concepts: [createConcept()],
    relations: [],
    mappings: [
      {
        externalId: 'mapping_001',
        sourceExternalId: 'https://example.org/concept/graph-theory',
        targetExternalId: 'https://www.wikidata.org/entity/Q6507',
        mappingKind: 'exact_match',
        confidenceScore: 0.96,
        confidenceBand: 'high',
        conflictFlags: [],
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
  };
}

function createTransitiveBatch(): INormalizedOntologyGraphBatch {
  const batch = createBatch();
  return {
    ...batch,
    mappings: [
      ...batch.mappings,
      {
        externalId: 'mapping_002',
        sourceExternalId: 'https://www.wikidata.org/entity/Q6507',
        targetExternalId: 'https://dbpedia.org/resource/Graph_theory',
        mappingKind: 'close_match',
        confidenceScore: 0.84,
        confidenceBand: 'medium',
        conflictFlags: [],
        provenance: batch.mappings[0]!.provenance,
      },
    ],
  };
}

class StubNodeRepository implements INodeRepository {
  constructor(private readonly nodes: IGraphNode[]) {}

  createNode(): Promise<IGraphNode> {
    throw new Error('Not implemented in test');
  }

  getNode(): Promise<IGraphNode | null> {
    throw new Error('Not implemented in test');
  }

  updateNode(): Promise<IGraphNode> {
    throw new Error('Not implemented in test');
  }

  deleteNode(): Promise<void> {
    throw new Error('Not implemented in test');
  }

  findNodes(): Promise<IGraphNode[]> {
    return Promise.resolve(this.nodes);
  }

  countNodes(): Promise<number> {
    return Promise.resolve(this.nodes.length);
  }
}

describe('GraphCanonicalNodeResolver', () => {
  it('resolves concepts through alias-normalized labels and cross-source mappings', async () => {
    const nodeRepository = new StubNodeRepository([
      {
        nodeId: 'node_graph_theory',
        graphType: 'ckg',
        nodeType: 'concept',
        label: 'Graph-Theory',
        domain: 'world-knowledge',
        properties: {
          ontologyImport: {
            externalId: 'https://www.wikidata.org/entity/Q6507',
            iri: 'https://www.wikidata.org/entity/Q6507',
            aliases: ['graph theory'],
          },
        },
        createdAt: '2026-03-24T12:00:00.000Z',
        updatedAt: '2026-03-24T12:00:00.000Z',
      },
    ]);

    const resolver = new GraphCanonicalNodeResolver(nodeRepository);
    const resolution = await resolver.resolveConcept(createConcept(), createBatch());

    expect(resolution.resolution).toEqual(
      expect.objectContaining({
        nodeId: 'node_graph_theory',
        strategy: 'external_id',
        confidenceBand: 'high',
      })
    );
  });

  it('walks transitive exact/close mapping neighborhoods during canonical resolution', async () => {
    const nodeRepository = new StubNodeRepository([
      {
        nodeId: 'node_graph_theory',
        graphType: 'ckg',
        nodeType: 'concept',
        label: 'Graph Theory',
        domain: 'world-knowledge',
        properties: {
          ontologyImport: {
            externalId: 'https://dbpedia.org/resource/Graph_theory',
            aliases: ['graph theory'],
          },
        },
        createdAt: '2026-03-24T12:00:00.000Z',
        updatedAt: '2026-03-24T12:00:00.000Z',
      },
    ]);

    const resolver = new GraphCanonicalNodeResolver(nodeRepository);
    const resolution = await resolver.resolveConcept(createConcept(), createTransitiveBatch());

    expect(resolution.resolution).toEqual(
      expect.objectContaining({
        nodeId: 'node_graph_theory',
        strategy: 'external_id',
      })
    );
  });

  it('prefers namespace-aware candidates when multiple labels collide', async () => {
    const nodeRepository = new StubNodeRepository([
      {
        nodeId: 'node_other_graph_theory',
        graphType: 'ckg',
        nodeType: 'concept',
        label: 'Graph Theory',
        domain: 'world-knowledge',
        properties: {
          ontologyImport: {
            externalId: 'https://other.example.org/resource/Graph_Theory',
            aliases: ['graph theory'],
          },
        },
        createdAt: '2026-03-24T12:00:00.000Z',
        updatedAt: '2026-03-24T12:00:00.000Z',
      },
      {
        nodeId: 'node_preferred_graph_theory',
        graphType: 'ckg',
        nodeType: 'concept',
        label: 'Graph Theory',
        domain: 'world-knowledge',
        properties: {
          ontologyImport: {
            externalId: 'https://www.wikidata.org/entity/Q6507',
            aliases: ['graph theory'],
          },
        },
        createdAt: '2026-03-24T12:00:00.000Z',
        updatedAt: '2026-03-24T12:00:00.000Z',
      },
    ]);

    const resolver = new GraphCanonicalNodeResolver(nodeRepository);
    const resolution = await resolver.resolveConcept(createConcept(), createBatch());

    expect(resolution.resolution).toEqual(
      expect.objectContaining({
        nodeId: 'node_preferred_graph_theory',
      })
    );
  });
});
