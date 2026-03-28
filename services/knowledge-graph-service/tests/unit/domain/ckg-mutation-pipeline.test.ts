import { describe, expect, it, vi } from 'vitest';

import type { IGraphNode, Metadata, MutationId } from '@noema/types';

import { CkgMutationPipeline } from '../../../src/domain/knowledge-graph-service/ckg-mutation-pipeline.js';

describe('CkgMutationPipeline applyOperations', () => {
  it('forwards ontology identity metadata when committing add_node operations', async () => {
    const createNode = vi.fn(() =>
      Promise.resolve({
        nodeId: 'node_euler',
        graphType: 'ckg',
        nodeType: 'concept',
        label: 'Leonhard Euler',
        domain: 'world-knowledge',
        properties: {},
        createdAt: '2026-03-28T10:00:00.000Z',
        updatedAt: '2026-03-28T10:00:00.000Z',
      })
    );

    const txRepo = {
      createNode,
    };

    const graphRepository = {
      runInTransaction: async <T>(fn: (repo: typeof txRepo) => Promise<T>): Promise<T> =>
        fn(txRepo),
    };

    const pipeline = new CkgMutationPipeline(
      {} as never,
      graphRepository as never,
      {} as never,
      {} as never,
      {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      } as never
    );

    const mutation = {
      mutationId: 'mut_001' as MutationId,
      state: 'proven',
      proposedBy: 'agent_ontology' as never,
      version: 1,
      rationale: 'Import Leonhard Euler from YAGO',
      evidenceCount: 1,
      createdAt: '2026-03-28T10:00:00.000Z',
      updatedAt: '2026-03-28T10:00:00.000Z',
      recoveryAttempts: 0,
      revisionCount: 0,
      revisionFeedback: null,
      operations: [
        {
          type: 'add_node',
          nodeType: 'concept',
          label: 'Leonhard Euler',
          description: 'Swiss mathematician.',
          domain: 'world-knowledge',
          aliases: ['Euler'],
          languages: ['en'],
          tags: ['mathematics'],
          semanticHints: ['person'],
          canonicalExternalRefs: [
            {
              sourceId: 'yago',
              externalId: 'https://yago-knowledge.org/resource/Leonhard_Euler',
              iri: 'https://yago-knowledge.org/resource/Leonhard_Euler',
            },
          ],
          ontologyMappings: [
            {
              sourceId: 'yago',
              externalId: 'https://yago-knowledge.org/resource/Leonhard_Euler',
              mappingKind: 'same_as',
              targetExternalId: 'Q123',
            },
          ],
          provenance: [
            {
              sourceId: 'yago',
              sourceVersion: '4.5',
            },
          ],
          reviewMetadata: {
            confidenceScore: 0.97,
            confidenceBand: 'high',
          },
          sourceCoverage: {
            contributingSourceIds: ['yago'],
            sourceCount: 1,
          },
          properties: {
            literalFacts: {
              birthDate: '1707-04-15',
            },
          },
        },
      ] as Metadata[],
    };

    const result = await (
      pipeline as unknown as {
        applyOperations(input: typeof mutation): Promise<{ createdNodeIds: string[] }>;
      }
    ).applyOperations(mutation);

    expect(createNode).toHaveBeenCalledWith(
      'ckg',
      expect.objectContaining({
        canonicalExternalRefs: [
          expect.objectContaining({
            sourceId: 'yago',
            externalId: 'https://yago-knowledge.org/resource/Leonhard_Euler',
          }),
        ],
        ontologyMappings: [
          expect.objectContaining({
            mappingKind: 'same_as',
            targetExternalId: 'Q123',
          }),
        ],
        provenance: [expect.objectContaining({ sourceId: 'yago' })],
        reviewMetadata: expect.objectContaining({ confidenceBand: 'high' }),
        sourceCoverage: expect.objectContaining({ sourceCount: 1 }),
      })
    );
    expect(result.createdNodeIds).toEqual(['node_euler']);
  });

  it('forwards ontology metadata on update_node operations too', async () => {
    const updateNode = vi.fn(
      () =>
        Promise.resolve({
          nodeId: 'node_euler',
          graphType: 'ckg',
          nodeType: 'concept',
          label: 'Leonhard Euler',
          domain: 'world-knowledge',
          properties: {},
          createdAt: '2026-03-28T10:00:00.000Z',
          updatedAt: '2026-03-28T10:05:00.000Z',
        }) satisfies IGraphNode
    );

    const txRepo = {
      updateNode,
    };

    const graphRepository = {
      runInTransaction: async <T>(fn: (repo: typeof txRepo) => Promise<T>): Promise<T> =>
        fn(txRepo),
    };

    const pipeline = new CkgMutationPipeline(
      {} as never,
      graphRepository as never,
      {} as never,
      {} as never,
      {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      } as never
    );

    const mutation = {
      mutationId: 'mut_002' as MutationId,
      state: 'proven',
      proposedBy: 'agent_ontology' as never,
      version: 1,
      rationale: 'Update Leonhard Euler mappings',
      evidenceCount: 1,
      createdAt: '2026-03-28T10:00:00.000Z',
      updatedAt: '2026-03-28T10:00:00.000Z',
      recoveryAttempts: 0,
      revisionCount: 0,
      revisionFeedback: null,
      operations: [
        {
          type: 'update_node',
          nodeId: 'node_euler',
          updates: {
            canonicalExternalRefs: [
              {
                sourceId: 'wikidata',
                externalId: 'Q129',
              },
            ],
            ontologyMappings: [
              {
                sourceId: 'yago',
                externalId: 'https://yago-knowledge.org/resource/Leonhard_Euler',
                mappingKind: 'same_as',
                targetExternalId: 'Q129',
              },
            ],
            provenance: [
              {
                sourceId: 'wikidata',
                sourceVersion: '2026-03-28',
              },
            ],
            reviewMetadata: {
              confidenceScore: 0.99,
              confidenceBand: 'high',
            },
            sourceCoverage: {
              contributingSourceIds: ['yago', 'wikidata'],
              sourceCount: 2,
            },
          },
          rationale: 'Add linked ontology anchors.',
        },
      ] as Metadata[],
    };

    await (
      pipeline as unknown as {
        applyOperations(input: typeof mutation): Promise<unknown>;
      }
    ).applyOperations(mutation);

    expect(updateNode).toHaveBeenCalledWith(
      'node_euler',
      expect.objectContaining({
        canonicalExternalRefs: [
          expect.objectContaining({
            sourceId: 'wikidata',
            externalId: 'Q129',
          }),
        ],
        ontologyMappings: [
          expect.objectContaining({
            mappingKind: 'same_as',
            targetExternalId: 'Q129',
          }),
        ],
        provenance: [expect.objectContaining({ sourceId: 'wikidata' })],
        reviewMetadata: expect.objectContaining({ confidenceScore: 0.99 }),
        sourceCoverage: expect.objectContaining({ sourceCount: 2 }),
      })
    );
  });
});
