import { describe, expect, it } from 'vitest';
import { MisconceptionPatternKind } from '@noema/types';

import { SemanticMisconceptionDetector } from '../../../src/domain/knowledge-graph-service/misconception/detectors/semantic-detector.js';

describe('SemanticMisconceptionDetector', () => {
  it('returns heuristic semantic detections when enabled instead of throwing', () => {
    const detector = new SemanticMisconceptionDetector({ vectorServiceEnabled: true });

    const results = detector.detect({
      pkgSubgraph: {
        nodes: [
          {
            nodeId: 'node_a',
            label: 'GraphQL',
            nodeType: 'concept',
            domain: 'computer-science',
          },
          {
            nodeId: 'node_b',
            label: 'Graph QL',
            nodeType: 'concept',
            domain: 'computer-science',
          },
        ],
        edges: [],
      },
      ckgSubgraph: {
        nodes: [],
        edges: [],
      },
      comparison: {
        nodeAlignment: new Map(),
        alignedNodePairs: [],
        missingInPkg: [],
        extraInPkg: [],
        divergences: [],
        summary: {
          alignmentScore: 0,
          missingCount: 0,
          extraCount: 0,
          divergenceCount: 0,
        },
      },
      patterns: [
        {
          patternId: 'pattern_semantic_1',
          kind: MisconceptionPatternKind.SEMANTIC,
          name: 'semantic_similarity_gap',
          description: 'Detect semantically similar but disconnected concepts',
          threshold: 0.7,
          config: {},
          active: true,
          createdAt: '2026-04-03T10:00:00.000Z',
          updatedAt: '2026-04-03T10:00:00.000Z',
        },
      ],
      domain: 'computer-science',
      userId: 'user_1',
    } as never);

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          patternId: 'pattern_semantic_1',
          affectedNodeIds: ['node_a', 'node_b'],
        }),
      ])
    );
  });
});
