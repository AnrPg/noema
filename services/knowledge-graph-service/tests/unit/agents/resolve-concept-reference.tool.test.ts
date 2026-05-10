import { describe, expect, it } from 'vitest';
import { GraphNodeType, type IGraphNode, type UserId } from '@noema/types';

import { createResolveConceptReferenceHandler } from '../../../src/agents/tools/kg.tools.js';
import { mockKnowledgeGraphService } from '../../helpers/mocks.js';

function createNode(overrides: Partial<IGraphNode>): IGraphNode {
  return {
    nodeId: 'node_aaaaaaaaaaaaaaaaaaaaa' as never,
    graphType: 'pkg',
    nodeType: GraphNodeType.CONCEPT,
    label: 'Family',
    domain: 'relationships',
    aliases: [],
    supportedStudyModes: ['knowledge_gaining'],
    properties: {},
    createdAt: '2026-05-06T00:00:00.000Z',
    updatedAt: '2026-05-06T00:00:00.000Z',
    ...overrides,
  };
}

function createPage(items: IGraphNode[]) {
  return {
    data: {
      items,
      total: items.length,
      hasMore: false,
    },
    agentHints: {
      suggestedNextActions: [],
      relatedResources: [],
      confidence: 0.8,
      sourceQuality: 'high' as const,
      validityPeriod: 'short' as const,
      contextNeeded: [],
      assumptions: [],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: { benefit: 0, effort: 0.1, roi: 0 },
      preferenceAlignment: [],
      reasoning: 'test',
    },
  };
}

describe('resolve-concept-reference tool', () => {
  it('searches PKG and CKG while preferring an exact PKG match', async () => {
    const service = mockKnowledgeGraphService();
    const pkgNode = createNode({
      nodeId: 'node_pkgfamilyaaaaaaaaaaaa' as never,
      graphType: 'pkg',
      label: 'Family',
      properties: { conceptId: 'concept_pkgfamilyaaaaaaaaaaaa' },
    });
    const ckgNode = createNode({
      nodeId: 'node_ckgfamilyaaaaaaaaaaaa' as never,
      graphType: 'ckg',
      label: 'Family',
      properties: { conceptId: 'concept_ckgfamilyaaaaaaaaaaaa' },
    });

    service.listNodes.mockResolvedValue(createPage([pkgNode]));
    service.listCkgNodes.mockResolvedValue(createPage([ckgNode]));

    const handler = createResolveConceptReferenceHandler(service as never);
    const result = await handler(
      { ref: 'Family', graphType: 'both', studyMode: 'knowledge_gaining', limit: 8 },
      'user_123' as UserId,
      'corr_123'
    );

    expect(result.success).toBe(true);
    const data = result.data as { match: unknown; matches: unknown[] };
    expect(data.match).toMatchObject({
      nodeId: 'node_pkgfamilyaaaaaaaaaaaa',
      graphType: 'pkg',
      label: 'Family',
    });
    expect(data.matches).toHaveLength(2);
    expect(service.listNodes).toHaveBeenCalledOnce();
    expect(service.listCkgNodes).toHaveBeenCalledOnce();
    expect(service.listNodes.mock.calls[0]?.[1]).toMatchObject({
      labelContains: 'family',
      searchMode: 'substring',
    });
    expect(service.listNodes.mock.calls[0]?.[1]).not.toHaveProperty('sortBy');
  });

  it('returns PKG matches even when the CKG side fails', async () => {
    const service = mockKnowledgeGraphService();
    service.listNodes.mockResolvedValue(createPage([createNode({ label: 'Family' })]));
    service.listCkgNodes.mockRejectedValue(new Error('CKG unavailable'));

    const handler = createResolveConceptReferenceHandler(service as never);
    const result = await handler({ ref: 'Family', graphType: 'both' }, 'user_123', 'corr_123');

    expect(result.success).toBe(true);
    const data = result.data as { resolved: boolean; match: unknown };
    expect(data.resolved).toBe(true);
    expect(data.match).toMatchObject({ graphType: 'pkg', label: 'Family' });
  });
});
