import { beforeEach, describe, expect, it, vi } from 'vitest';

const { httpGet, httpPost } = vi.hoisted(() => ({
  httpGet: vi.fn(),
  httpPost: vi.fn(),
}));

vi.mock('../client.js', () => ({
  http: {
    get: httpGet,
    post: httpPost,
  },
}));

import { conceptStateApi, pkgEdgesApi, pkgNodesApi, stabilityApi } from './api.js';

describe('pkgNodesApi.create', () => {
  beforeEach(() => {
    httpPost.mockReset();
    httpPost.mockResolvedValue({ success: true, data: {} });
  });

  it('trims the provided domain before sending the request', async () => {
    await pkgNodesApi.create('user_123' as never, {
      label: 'Family',
      type: 'concept',
      domain: '  linguistics  ',
    });

    expect(httpPost).toHaveBeenCalledWith('/api/v1/users/user_123/pkg/nodes', {
      label: 'Family',
      type: 'concept',
      domain: 'linguistics',
    });
  });

  it('falls back to the general domain when the provided domain is blank', async () => {
    await pkgNodesApi.create('user_123' as never, {
      label: 'Family',
      type: 'concept',
      domain: '   ',
    });

    expect(httpPost).toHaveBeenCalledWith('/api/v1/users/user_123/pkg/nodes', {
      label: 'Family',
      type: 'concept',
      domain: 'general',
    });
  });
});

describe('stabilityApi', () => {
  beforeEach(() => {
    httpGet.mockReset();
    httpGet.mockResolvedValue({ success: true, data: {} });
  });

  it('reads the Batch 7 binary concept stability summary endpoint', async () => {
    await stabilityApi.getSummary('user_123' as never, {
      studyMode: 'knowledge_gaining',
    });

    expect(httpGet).toHaveBeenCalledWith('/v1/users/user_123/stability-summary', {
      params: { studyMode: 'knowledge_gaining' },
    });
  });
});

describe('conceptStateApi', () => {
  beforeEach(() => {
    httpGet.mockReset();
    httpGet.mockResolvedValue({ success: true, data: {} });
  });

  it('reads the current derived concept state', async () => {
    await conceptStateApi.getState('concept_123' as never, {
      userId: 'user_123' as never,
      studyMode: 'language_learning',
    });

    expect(httpGet).toHaveBeenCalledWith('/v1/concepts/concept_123/state', {
      params: { userId: 'user_123', studyMode: 'language_learning' },
    });
  });

  it('reads prerequisite gaps for the derived state projection', async () => {
    await conceptStateApi.getPrerequisiteGaps('concept_123' as never, {
      userId: 'user_123' as never,
      studyMode: 'knowledge_gaining',
    });

    expect(httpGet).toHaveBeenCalledWith('/v1/concepts/concept_123/prerequisite-gaps', {
      params: { userId: 'user_123', studyMode: 'knowledge_gaining' },
    });
  });
});

describe('pkgEdgesApi.create', () => {
  beforeEach(() => {
    httpPost.mockReset();
    httpPost.mockResolvedValue({ success: true, data: {} });
  });

  it('maps friendly edge fields to the service create-edge contract', async () => {
    await pkgEdgesApi.create('user_123' as never, {
      sourceId: 'node_source' as never,
      targetId: 'node_target' as never,
      type: 'part_of',
      weight: 1,
      metadata: { origin: 'quick-edge' },
    });

    expect(httpPost).toHaveBeenCalledWith('/api/v1/users/user_123/pkg/edges', {
      edgeType: 'part_of',
      sourceNodeId: 'node_source',
      targetNodeId: 'node_target',
      weight: 1,
      properties: { origin: 'quick-edge' },
    });
  });

  it('passes through callers that already use the service create-edge contract', async () => {
    await pkgEdgesApi.create('user_123' as never, {
      sourceNodeId: 'node_source' as never,
      targetNodeId: 'node_target' as never,
      edgeType: 'prerequisite',
      skipAcyclicityCheck: true,
    });

    expect(httpPost).toHaveBeenCalledWith('/api/v1/users/user_123/pkg/edges', {
      edgeType: 'prerequisite',
      sourceNodeId: 'node_source',
      targetNodeId: 'node_target',
      skipAcyclicityCheck: true,
    });
  });
});
