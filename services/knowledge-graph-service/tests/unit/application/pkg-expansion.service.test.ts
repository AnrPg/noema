import { describe, expect, it, vi } from 'vitest';

import {
  HttpKnowledgeGraphExpansionAgentClient,
  PkgExpansionApplicationService,
} from '../../../src/application/knowledge-graph/pkg-expansion/service.js';
import type {
  IExecutionContext,
  IKnowledgeGraphService,
} from '../../../src/domain/knowledge-graph-service/knowledge-graph.service.js';
import {
  UpstreamServiceProtocolError,
  UpstreamServiceUnavailableError,
} from '../../../src/domain/knowledge-graph-service/errors/base.errors.js';

const TEST_CONTEXT: IExecutionContext = {
  userId: 'user_test_1',
  correlationId: 'cor_test_1',
  roles: [],
  clientIp: '127.0.0.1',
};

describe('PkgExpansionApplicationService', () => {
  it('returns an empty proposal bundle when the scoped PKG slice has no concepts', async () => {
    const listNodes = vi.fn().mockResolvedValue({
      data: {
        items: [],
        total: 0,
        limit: 24,
        offset: 0,
      },
      agentHints: [],
    });
    const graphService = {
      listNodes,
    } as unknown as IKnowledgeGraphService;
    const agentClient = {
      generateExpansion: vi.fn(),
    };
    const service = new PkgExpansionApplicationService(graphService, agentClient);

    const result = await service.preview(
      'user_test_1',
      {
        scope: {
          scopeType: 'domain',
          nodeIds: [],
          domain: 'Pets',
        },
        studyMode: 'knowledge_gaining',
        limit: 24,
      },
      TEST_CONTEXT
    );

    expect(listNodes).toHaveBeenCalledOnce();
    expect(agentClient.generateExpansion).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({
      artifactKind: 'pkg_expansion_proposal_bundle',
      scope: {
        scopeType: 'domain',
        nodeIds: [],
        domain: 'Pets',
      },
      summary: {
        proposalCount: 0,
        nodeProposalCount: 0,
        edgeProposalCount: 0,
        wordingProposalCount: 0,
        canonicalCandidateCount: 0,
      },
      proposals: [],
    });
    expect(result.data['generatedAt']).toEqual(expect.any(String));
  });

  it('applies an approved graph suggestion by creating the supporting node first, then the dependent edge, while preserving metadata', async () => {
    const createNode = vi.fn().mockResolvedValue({
      data: { nodeId: 'node_created_1' },
      agentHints: [],
    });
    const createEdge = vi.fn().mockResolvedValue({
      data: { edgeId: 'edge_created_1' },
      agentHints: [],
    });
    const proposeMutation = vi.fn().mockResolvedValue({
      data: { mutationId: 'mutation_1' },
      agentHints: [],
    });

    const graphService = {
      createNode,
      createEdge,
      proposeMutation,
    } as unknown as IKnowledgeGraphService;
    const service = new PkgExpansionApplicationService(graphService, {
      generateExpansion: vi.fn(),
    });

    const result = await service.applyGraphAgentProposals(
      'user_test_1',
      {
        selectedProposalIds: ['proposal_edge_1'],
        proposals: [
          {
            proposalId: 'proposal_node_1',
            conceptId: 'Bayes theorem',
            candidateLabel: 'Bayes theorem',
            proposalType: 'add_node',
            rationale: 'Add the missing prerequisite notion.',
            operation: {
              type: 'add_node',
              label: 'Bayes theorem',
              nodeType: 'notion',
              domain: 'probability',
              description: 'A notion about conditional probability inversion.',
              aliases: ['Bayes rule'],
              tags: ['probability', 'statistics'],
              semanticHints: ['prerequisite'],
              supportedStudyModes: ['knowledge_gaining'],
              canonicalExternalRefs: [{ source: 'wikidata', id: 'Q81096' }],
              ontologyMappings: [{ source: 'ckg', targetId: 'concept_bayes' }],
              provenance: [{ sourceDocumentId: 'doc_1' }],
              reviewMetadata: { reviewerSurface: 'knowledge-map' },
              sourceCoverage: { sourceDocumentIds: ['doc_1'] },
              properties: { source: 'agent', confidenceBand: 'high' },
              stabilityLevel: 0.61,
            },
            confidenceScore: 0.96,
            reviewState: 'draft',
            sourceDocumentIds: ['doc_1'],
            metadata: { workspace: 'review' },
            ckgOperations: [],
          },
          {
            proposalId: 'proposal_edge_1',
            conceptId: 'posterior-probability',
            candidateLabel: 'Posterior probability',
            proposalType: 'add_edge',
            rationale: 'Connect the new notion to the existing concept graph.',
            operation: {
              type: 'add_edge',
              sourceNodeId: 'Bayes theorem',
              targetNodeId: 'node_existing_1',
              edgeType: 'prerequisite',
              weight: 0.8,
              properties: { source: 'agent', relationConfidence: 'high' },
            },
            confidenceScore: 0.88,
            reviewState: 'draft',
            sourceDocumentIds: ['doc_1'],
            metadata: { workspace: 'review' },
            ckgOperations: [
              {
                type: 'create_concept',
                label: 'Bayes theorem',
              },
            ],
          },
        ],
        forwardCanonical: true,
      },
      TEST_CONTEXT
    );

    expect(createNode).toHaveBeenCalledOnce();
    expect(createNode).toHaveBeenCalledWith(
      'user_test_1',
      expect.objectContaining({
        label: 'Bayes theorem',
        nodeType: 'notion',
        domain: 'probability',
        description: 'A notion about conditional probability inversion.',
        aliases: ['Bayes rule'],
        tags: ['probability', 'statistics'],
        semanticHints: ['prerequisite'],
        supportedStudyModes: ['knowledge_gaining'],
        reviewMetadata: { reviewerSurface: 'knowledge-map' },
        sourceCoverage: { sourceDocumentIds: ['doc_1'] },
        properties: { source: 'agent', confidenceBand: 'high' },
        stabilityLevel: 0.61,
      }),
      TEST_CONTEXT
    );
    expect(createEdge).toHaveBeenCalledOnce();
    expect(createEdge).toHaveBeenCalledWith(
      'user_test_1',
      {
        sourceNodeId: 'node_created_1',
        targetNodeId: 'node_existing_1',
        edgeType: 'prerequisite',
        weight: 0.8,
        properties: { source: 'agent', relationConfidence: 'high' },
      },
      TEST_CONTEXT
    );
    expect(proposeMutation).toHaveBeenCalledOnce();
    expect(proposeMutation).toHaveBeenCalledWith(
      {
        operations: [
          {
            type: 'create_concept',
            label: 'Bayes theorem',
          },
        ],
        rationale: 'Connect the new notion to the existing concept graph.',
        evidenceCount: 1,
        priority: 20,
      },
      TEST_CONTEXT
    );
    expect(result.data).toEqual({
      appliedProposalIds: ['proposal_node_1', 'proposal_edge_1'],
      createdNodeIds: ['node_created_1'],
      createdEdgeIds: ['edge_created_1'],
      updatedNodeIds: [],
      canonicalMutationIds: ['mutation_1'],
      skippedProposalIds: [],
      message: 'Applied 2 graph suggestion(s).',
    });
  });

  it('resolves label references to existing subject nodes and creates missing prerequisite labels when a single structural edge is approved', async () => {
    const listNodes = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          items: [],
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              nodeId: 'node_existing_microbiology',
              label: 'microbiology',
            },
          ],
        },
      });
    const createNode = vi.fn().mockResolvedValue({
      data: { nodeId: 'node_created_biology' },
      agentHints: [],
    });
    const createEdge = vi.fn().mockResolvedValue({
      data: { edgeId: 'edge_created_1' },
      agentHints: [],
    });
    const graphService = {
      listNodes,
      createNode,
      createEdge,
      proposeMutation: vi.fn(),
    } as unknown as IKnowledgeGraphService;
    const service = new PkgExpansionApplicationService(graphService, {
      generateExpansion: vi.fn(),
    });

    const result = await service.applyGraphAgentProposals(
      'user_test_1',
      {
        selectedProposalIds: ['proposal_structural_1'],
        proposals: [
          {
            proposalId: 'proposal_structural_1',
            conceptId: 'microbiology',
            proposalType: 'STRUCTURAL',
            rationale: 'Biology is a prerequisite of microbiology.',
            operation: {
              type: 'add_edge',
              edgeType: 'prerequisite',
              sourceNodeId: 'Biology',
              targetNodeId: 'microbiology',
              weight: 0.95,
            },
            confidenceScore: 0.95,
            reviewState: 'draft',
            sourceDocumentIds: [],
            metadata: {},
            ckgOperations: [],
          },
        ],
        forwardCanonical: true,
      },
      TEST_CONTEXT
    );

    expect(listNodes).toHaveBeenCalledTimes(2);
    expect(createNode).toHaveBeenCalledWith(
      'user_test_1',
      expect.objectContaining({
        label: 'Biology',
        nodeType: 'notion',
        domain: 'general',
      }),
      TEST_CONTEXT
    );
    expect(createEdge).toHaveBeenCalledWith(
      'user_test_1',
      {
        sourceNodeId: 'node_created_biology',
        targetNodeId: 'node_existing_microbiology',
        edgeType: 'prerequisite',
        weight: 0.95,
      },
      TEST_CONTEXT
    );
    expect(result.data).toEqual({
      appliedProposalIds: ['proposal_structural_1'],
      createdNodeIds: ['node_created_biology'],
      createdEdgeIds: ['edge_created_1'],
      updatedNodeIds: [],
      canonicalMutationIds: [],
      skippedProposalIds: [],
      message: 'Applied 1 graph suggestion(s).',
    });
  });

  it('reuses the same synthesized support node when an edge is approved before its sibling add-node proposal', async () => {
    const listNodes = vi
      .fn()
      .mockResolvedValueOnce({ data: { items: [] } })
      .mockResolvedValueOnce({
        data: {
          items: [{ nodeId: 'node_existing_microbiology', label: 'microbiology' }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [{ nodeId: 'node_created_biology', label: 'Biology' }],
        },
      });
    const createNode = vi.fn().mockResolvedValue({
      data: { nodeId: 'node_created_biology' },
      agentHints: [],
    });
    const createEdge = vi.fn().mockResolvedValue({
      data: { edgeId: 'edge_created_1' },
      agentHints: [],
    });
    const graphService = {
      listNodes,
      createNode,
      createEdge,
      proposeMutation: vi.fn(),
    } as unknown as IKnowledgeGraphService;
    const service = new PkgExpansionApplicationService(graphService, {
      generateExpansion: vi.fn(),
    });

    const proposals = [
      {
        proposalId: 'proposal_node_biology',
        conceptId: 'Biology',
        candidateLabel: 'Biology',
        proposalType: 'add_node',
        rationale: 'Create Biology as the missing support notion.',
        operation: {
          type: 'add_node',
          label: 'Biology',
          nodeType: 'notion',
          domain: 'biology',
        },
        ckgOperations: [],
      },
      {
        proposalId: 'proposal_edge_biology',
        conceptId: 'microbiology',
        candidateLabel: 'Biology',
        proposalType: 'STRUCTURAL',
        rationale: 'Biology should be connected as a prerequisite for microbiology.',
        operation: {
          type: 'add_edge',
          sourceNodeId: 'Biology',
          targetNodeId: 'microbiology',
          edgeType: 'prerequisite',
        },
        ckgOperations: [],
      },
    ];

    const edgeFirst = await service.applyGraphAgentProposals(
      'user_test_1',
      {
        selectedProposalIds: ['proposal_edge_biology'],
        proposals,
        forwardCanonical: true,
      },
      TEST_CONTEXT
    );

    const nodeLater = await service.applyGraphAgentProposals(
      'user_test_1',
      {
        selectedProposalIds: ['proposal_node_biology'],
        proposals,
        forwardCanonical: true,
      },
      TEST_CONTEXT
    );

    expect(createNode).toHaveBeenCalledOnce();
    expect(createEdge).toHaveBeenCalledOnce();
    expect(edgeFirst.data).toEqual({
      appliedProposalIds: ['proposal_node_biology', 'proposal_edge_biology'],
      createdNodeIds: ['node_created_biology'],
      createdEdgeIds: ['edge_created_1'],
      updatedNodeIds: [],
      canonicalMutationIds: [],
      skippedProposalIds: [],
      message: 'Applied 2 graph suggestion(s).',
    });
    expect(nodeLater.data).toEqual({
      appliedProposalIds: ['proposal_node_biology'],
      createdNodeIds: [],
      createdEdgeIds: [],
      updatedNodeIds: [],
      canonicalMutationIds: [],
      skippedProposalIds: [],
      message: 'Applied 1 graph suggestion(s).',
    });
  });

  it('reuses an exact existing PKG node when an approved add-node proposal would otherwise duplicate it', async () => {
    const listNodes = vi.fn().mockResolvedValue({
      data: {
        items: [{ nodeId: 'node_existing_biology', label: 'Biology' }],
      },
    });
    const createNode = vi.fn();
    const graphService = {
      listNodes,
      createNode,
      createEdge: vi.fn(),
      proposeMutation: vi.fn(),
    } as unknown as IKnowledgeGraphService;
    const service = new PkgExpansionApplicationService(graphService, {
      generateExpansion: vi.fn(),
    });

    const result = await service.applyGraphAgentProposals(
      'user_test_1',
      {
        selectedProposalIds: ['proposal_node_biology'],
        proposals: [
          {
            proposalId: 'proposal_node_biology',
            conceptId: 'Biology',
            candidateLabel: 'Biology',
            proposalType: 'add_node',
            rationale: 'Create Biology if it does not exist yet.',
            operation: {
              type: 'add_node',
              label: 'Biology',
              nodeType: 'notion',
              domain: 'biology',
            },
            ckgOperations: [],
          },
        ],
        forwardCanonical: true,
      },
      TEST_CONTEXT
    );

    expect(createNode).not.toHaveBeenCalled();
    expect(result.data).toEqual({
      appliedProposalIds: ['proposal_node_biology'],
      createdNodeIds: [],
      createdEdgeIds: [],
      updatedNodeIds: [],
      canonicalMutationIds: [],
      skippedProposalIds: [],
      message: 'Applied 1 graph suggestion(s).',
    });
  });

  it('applies dependent expansion operations in order by reusing created temp node refs for edges', async () => {
    const createNode = vi.fn().mockResolvedValue({
      data: { nodeId: 'node_created_biology' },
      agentHints: [],
    });
    const createEdge = vi.fn().mockResolvedValue({
      data: { edgeId: 'edge_created_microbiology' },
      agentHints: [],
    });
    const graphService = {
      createNode,
      createEdge,
      proposeMutation: vi.fn(),
    } as unknown as IKnowledgeGraphService;
    const service = new PkgExpansionApplicationService(graphService, {
      generateExpansion: vi.fn(),
    });

    const result = await service.apply(
      'user_test_1',
      {
        scope: {
          scopeType: 'node',
          nodeIds: ['node_existing_microbiology'],
        },
        selectedProposalIds: ['proposal_expand_biology'],
        proposals: [
          {
            proposalId: 'proposal_expand_biology',
            category: 'expand_edges',
            summary: 'Create Biology and connect it as a prerequisite.',
            rationale: 'Microbiology should connect to its broader prerequisite notion.',
            whatWillChange: 'Adds Biology and links it to microbiology.',
            impact: 'Improves PKG structure around microbiology.',
            pkgOperations: [
              {
                type: 'add_node',
                tempNodeRef: 'tmp_biology',
                label: 'Biology',
                nodeType: 'notion',
                domain: 'biology',
              },
              {
                type: 'add_edge',
                sourceTempRef: 'tmp_biology',
                targetNodeId: 'node_existing_microbiology',
                edgeType: 'prerequisite',
                weight: 0.9,
              },
            ],
            ckgOperations: [],
          },
        ],
        forwardCanonical: true,
      },
      TEST_CONTEXT
    );

    expect(createNode).toHaveBeenCalledOnce();
    expect(createEdge).toHaveBeenCalledOnce();
    expect(createEdge).toHaveBeenCalledWith(
      'user_test_1',
      {
        sourceNodeId: 'node_created_biology',
        targetNodeId: 'node_existing_microbiology',
        edgeType: 'prerequisite',
        weight: 0.9,
      },
      TEST_CONTEXT
    );
    expect(result.data).toEqual({
      appliedProposalIds: ['proposal_expand_biology'],
      createdNodeIds: ['node_created_biology'],
      createdEdgeIds: ['edge_created_microbiology'],
      updatedNodeIds: [],
      canonicalMutationIds: [],
      skippedProposalIds: [],
      message: 'Applied 1 expansion proposal(s).',
    });
  });

  it('resolves label-based expansion edge endpoints to created or existing PKG nodes', async () => {
    const listNodes = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          items: [{ nodeId: 'node_existing_microbiology', label: 'microbiology' }],
        },
      });
    const createNode = vi.fn().mockResolvedValue({
      data: { nodeId: 'node_created_biology' },
      agentHints: [],
    });
    const createEdge = vi.fn().mockResolvedValue({
      data: { edgeId: 'edge_created_biology_microbiology' },
      agentHints: [],
    });
    const graphService = {
      listNodes,
      createNode,
      createEdge,
      proposeMutation: vi.fn(),
    } as unknown as IKnowledgeGraphService;
    const service = new PkgExpansionApplicationService(graphService, {
      generateExpansion: vi.fn(),
    });

    const result = await service.apply(
      'user_test_1',
      {
        scope: {
          scopeType: 'node',
          nodeIds: ['node_existing_microbiology'],
        },
        selectedProposalIds: ['proposal_expand_biology_by_label'],
        proposals: [
          {
            proposalId: 'proposal_expand_biology_by_label',
            category: 'expand_edges',
            summary: 'Create Biology and connect it by label reference.',
            rationale: 'The proposal references nodes by label instead of explicit temp refs.',
            whatWillChange: 'Adds Biology and connects it to microbiology.',
            impact: 'Improves coverage for structural graph suggestions.',
            pkgOperations: [
              {
                type: 'add_node',
                label: 'Biology',
                nodeType: 'notion',
                domain: 'biology',
              },
              {
                type: 'add_edge',
                sourceNodeId: 'Biology',
                targetNodeId: 'microbiology',
                edgeType: 'prerequisite',
                weight: 0.91,
              },
            ],
            ckgOperations: [],
          },
        ],
        forwardCanonical: true,
      },
      TEST_CONTEXT
    );

    expect(createNode).toHaveBeenCalledOnce();
    expect(createEdge).toHaveBeenCalledOnce();
    expect(createEdge).toHaveBeenCalledWith(
      'user_test_1',
      {
        sourceNodeId: 'node_created_biology',
        targetNodeId: 'node_existing_microbiology',
        edgeType: 'prerequisite',
        weight: 0.91,
      },
      TEST_CONTEXT
    );
    expect(result.data).toEqual({
      appliedProposalIds: ['proposal_expand_biology_by_label'],
      createdNodeIds: ['node_created_biology'],
      createdEdgeIds: ['edge_created_biology_microbiology'],
      updatedNodeIds: [],
      canonicalMutationIds: [],
      skippedProposalIds: [],
      message: 'Applied 1 expansion proposal(s).',
    });
  });

  it('resolves alias-based graph-agent edge endpoints instead of dropping the edge', async () => {
    const listNodes = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          items: [{ nodeId: 'node_existing_biology', label: 'Biology' }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [{ nodeId: 'node_existing_microbiology', label: 'Microbiology' }],
        },
      });
    const createEdge = vi.fn().mockResolvedValue({
      data: { edgeId: 'edge_existing_biology_microbiology' },
      agentHints: [],
    });
    const graphService = {
      listNodes,
      createNode: vi.fn(),
      createEdge,
      proposeMutation: vi.fn(),
    } as unknown as IKnowledgeGraphService;
    const service = new PkgExpansionApplicationService(graphService, {
      generateExpansion: vi.fn(),
    });

    const result = await service.applyGraphAgentProposals(
      'user_test_1',
      {
        selectedProposalIds: ['proposal_edge_aliases'],
        proposals: [
          {
            proposalId: 'proposal_edge_aliases',
            conceptId: 'Microbiology',
            candidateLabel: 'Biology',
            proposalType: 'STRUCTURAL',
            rationale: 'Biology is a prerequisite of Microbiology.',
            operation: {
              type: 'add_edge',
              sourceLabel: 'Biology',
              targetLabel: 'Microbiology',
              edgeType: 'prerequisite',
              weight: 0.94,
            },
            ckgOperations: [],
          },
        ],
        forwardCanonical: true,
      },
      TEST_CONTEXT
    );

    expect(createEdge).toHaveBeenCalledOnce();
    expect(createEdge).toHaveBeenCalledWith(
      'user_test_1',
      {
        sourceNodeId: 'node_existing_biology',
        targetNodeId: 'node_existing_microbiology',
        edgeType: 'prerequisite',
        weight: 0.94,
      },
      TEST_CONTEXT
    );
    expect(result.data.createdEdgeIds).toEqual(['edge_existing_biology_microbiology']);
  });

  it('applies legacy structural graph proposals that were finalized as add-node payloads as edges', async () => {
    const listNodes = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          items: [{ nodeId: 'node_existing_biology', label: 'Biology' }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [{ nodeId: 'node_existing_microbiology', label: 'microbiology' }],
        },
      });
    const createNode = vi.fn();
    const createEdge = vi.fn().mockResolvedValue({
      data: { edgeId: 'edge_biology_microbiology' },
      agentHints: [],
    });
    const graphService = {
      listNodes,
      createNode,
      createEdge,
      proposeMutation: vi.fn(),
    } as unknown as IKnowledgeGraphService;
    const service = new PkgExpansionApplicationService(graphService, {
      generateExpansion: vi.fn(),
    });

    const result = await service.applyGraphAgentProposals(
      'user_test_1',
      {
        selectedProposalIds: ['proposal_legacy_structural_node'],
        proposals: [
          {
            proposalId: 'proposal_legacy_structural_node',
            conceptId: 'microbiology',
            candidateLabel: 'Biology',
            proposalType: 'STRUCTURAL_ADDITION',
            rationale: 'Biology is a foundational prerequisite for microbiology.',
            operation: {
              type: 'add_node',
              label: 'Biology',
              nodeType: 'concept',
              domain: 'general',
              properties: {
                source: 'knowledge-graph-agent',
                proposalType: 'STRUCTURAL_ADDITION',
              },
            },
            confidenceScore: 0.95,
            ckgOperations: [],
          },
        ],
        forwardCanonical: true,
      },
      TEST_CONTEXT
    );

    expect(createNode).not.toHaveBeenCalled();
    expect(createEdge).toHaveBeenCalledWith(
      'user_test_1',
      expect.objectContaining({
        sourceNodeId: 'node_existing_biology',
        targetNodeId: 'node_existing_microbiology',
        edgeType: 'prerequisite',
        weight: 0.95,
      }),
      TEST_CONTEXT
    );
    expect(result.data.createdEdgeIds).toEqual(['edge_biology_microbiology']);
  });

  it('fails loudly when an expansion edge endpoint cannot be resolved', async () => {
    const graphService = {
      listNodes: vi.fn().mockResolvedValue({ data: { items: [] } }),
      createNode: vi.fn(),
      createEdge: vi.fn(),
      proposeMutation: vi.fn(),
    } as unknown as IKnowledgeGraphService;
    const service = new PkgExpansionApplicationService(graphService, {
      generateExpansion: vi.fn(),
    });

    await expect(
      service.apply(
        'user_test_1',
        {
          scope: {
            scopeType: 'node',
            nodeIds: ['node_existing_microbiology'],
          },
          selectedProposalIds: ['proposal_bad_edge'],
          proposals: [
            {
              proposalId: 'proposal_bad_edge',
              category: 'expand_edges',
              summary: 'Connect a missing endpoint.',
              rationale: 'This proposal cannot resolve its endpoints.',
              whatWillChange: 'Attempts to create an edge.',
              impact: 'Should fail instead of silently reporting success.',
              pkgOperations: [
                {
                  type: 'add_edge',
                  sourceLabel: 'Missing source',
                  targetLabel: 'Missing target',
                  edgeType: 'related_to',
                },
              ],
              ckgOperations: [],
            },
          ],
          forwardCanonical: true,
        },
        TEST_CONTEXT
      )
    ).rejects.toThrow('Could not apply edge proposal');
  });

  it('maps fetch failures from the knowledge-graph agent to an upstream-unavailable domain error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1')));
    const client = new HttpKnowledgeGraphExpansionAgentClient({
      baseUrl: 'http://127.0.0.1:8011',
    });

    await expect(
      client.generateExpansion({
        userId: 'user_test_1',
        conceptIds: ['node_1'],
        selectedNodeIds: [],
        scope: { scopeType: 'whole_pkg', nodeIds: [] },
        studyMode: 'knowledge_gaining',
        correlationId: 'cor_test_1',
      })
    ).rejects.toBeInstanceOf(UpstreamServiceUnavailableError);

    vi.unstubAllGlobals();
  });

  it('maps malformed JSON responses from the knowledge-graph agent to a protocol error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('not-json', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    );
    const client = new HttpKnowledgeGraphExpansionAgentClient({
      baseUrl: 'http://127.0.0.1:8011',
    });

    await expect(
      client.generateExpansion({
        userId: 'user_test_1',
        conceptIds: ['node_1'],
        selectedNodeIds: [],
        scope: { scopeType: 'whole_pkg', nodeIds: [] },
        studyMode: 'knowledge_gaining',
        correlationId: 'cor_test_1',
      })
    ).rejects.toBeInstanceOf(UpstreamServiceProtocolError);

    vi.unstubAllGlobals();
  });
});
