import { describe, expect, it } from 'vitest';

import { GraphEdgeType, GraphNodeType } from '@noema/types';

import { CkgEdgeAuthoringService } from '../../../src/application/knowledge-graph/edge-authoring/index.js';
import { MockGraphRepository } from '../../helpers/mock-graph-repository.js';

async function createNode(repository: MockGraphRepository, label: string, nodeType: GraphNodeType) {
  return repository.createNode('ckg', {
    nodeType,
    label,
    domain: 'general',
  });
}

describe('CkgEdgeAuthoringService', () => {
  it.each([
    {
      sourceType: GraphNodeType.SKILL,
      targetType: GraphNodeType.SKILL,
      edgeType: GraphEdgeType.SUBSKILL_OF,
    },
    {
      sourceType: GraphNodeType.SKILL,
      targetType: GraphNodeType.SKILL,
      edgeType: GraphEdgeType.HAS_SUBSKILL,
    },
    {
      sourceType: GraphNodeType.SKILL,
      targetType: GraphNodeType.OCCUPATION,
      edgeType: GraphEdgeType.ESSENTIAL_FOR_OCCUPATION,
    },
    {
      sourceType: GraphNodeType.OCCUPATION,
      targetType: GraphNodeType.SKILL,
      edgeType: GraphEdgeType.OCCUPATION_REQUIRES_ESSENTIAL_SKILL,
    },
    {
      sourceType: GraphNodeType.PROCEDURE,
      targetType: GraphNodeType.SKILL,
      edgeType: GraphEdgeType.EXEMPLIFIES,
    },
  ])(
    'exposes %s as an enabled option for compatible node types',
    async ({ sourceType, targetType, edgeType }) => {
      const repository = new MockGraphRepository();
      const service = new CkgEdgeAuthoringService(repository);
      const source = await createNode(repository, `source-${edgeType}`, sourceType);
      const target = await createNode(repository, `target-${edgeType}`, targetType);

      const preview = await service.preview({
        sourceNodeId: source.nodeId,
        targetNodeId: target.nodeId,
      });

      const option = preview.options.find((entry) => entry.edgeType === edgeType);
      expect(option).toBeDefined();
      expect(option?.enabled).toBe(true);
      expect(option?.blockedReasons).toEqual([]);
    }
  );

  it.each([
    {
      existingEdgeType: GraphEdgeType.SUBSKILL_OF,
      previewEdgeType: GraphEdgeType.HAS_SUBSKILL,
      forwardSourceType: GraphNodeType.SKILL,
      forwardTargetType: GraphNodeType.SKILL,
    },
    {
      existingEdgeType: GraphEdgeType.ESSENTIAL_FOR_OCCUPATION,
      previewEdgeType: GraphEdgeType.OCCUPATION_REQUIRES_ESSENTIAL_SKILL,
      forwardSourceType: GraphNodeType.SKILL,
      forwardTargetType: GraphNodeType.OCCUPATION,
    },
    {
      existingEdgeType: GraphEdgeType.OPTIONAL_FOR_OCCUPATION,
      previewEdgeType: GraphEdgeType.OCCUPATION_BENEFITS_FROM_OPTIONAL_SKILL,
      forwardSourceType: GraphNodeType.SKILL,
      forwardTargetType: GraphNodeType.OCCUPATION,
    },
  ])(
    'blocks %s when the inverse-equivalent fact already exists',
    async ({ existingEdgeType, previewEdgeType, forwardSourceType, forwardTargetType }) => {
      const repository = new MockGraphRepository();
      const service = new CkgEdgeAuthoringService(repository);
      const first = await createNode(repository, `first-${existingEdgeType}`, forwardSourceType);
      const second = await createNode(repository, `second-${existingEdgeType}`, forwardTargetType);

      await repository.createEdge('ckg', {
        edgeType: existingEdgeType,
        sourceNodeId: first.nodeId,
        targetNodeId: second.nodeId,
        weight: 1,
      });

      const preview = await service.preview({
        sourceNodeId: second.nodeId,
        targetNodeId: first.nodeId,
        edgeType: previewEdgeType,
      });

      const option = preview.options.find((entry) => entry.edgeType === previewEdgeType);
      expect(option).toBeDefined();
      expect(option?.enabled).toBe(false);
      expect(option?.blockedReasons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'inverse_edge_exists',
          }),
        ])
      );
      expect(option?.existingEdgeIds).toHaveLength(1);
      expect(preview.proposal).toBeNull();
    }
  );
});
