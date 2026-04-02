import { beforeEach, describe, expect, it, vi } from 'vitest';

const { httpPost } = vi.hoisted(() => ({
  httpPost: vi.fn(),
}));

vi.mock('../client.js', () => ({
  http: {
    post: httpPost,
  },
}));

import { pkgNodesApi } from './api.js';

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
