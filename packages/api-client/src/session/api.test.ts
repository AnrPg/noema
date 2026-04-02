import { describe, expect, it, vi, beforeEach } from 'vitest';

const { httpGet } = vi.hoisted(() => ({
  httpGet: vi.fn(),
}));

vi.mock('../client.js', () => ({
  http: {
    get: httpGet,
  },
}));

import { queueApi } from './api.js';

describe('queueApi.getQueue', () => {
  beforeEach(() => {
    httpGet.mockReset();
  });

  it('normalizes queue items from envelope responses', async () => {
    httpGet.mockResolvedValue({
      success: true,
      data: {
        sessionId: 'session_123',
        items: [
          {
            cardId: 'card_1',
            status: 'pending',
            position: 4,
          },
          {
            cardId: 'card_2',
            lane: 'calibration',
            position: 5,
            injectedBy: 'teacher',
          },
        ],
      },
    });

    const response = await queueApi.getQueue('session_123' as never);

    expect(response.data.sessionId).toBe('session_123');
    expect(response.data.remaining).toBe(1);
    expect(response.data.items).toEqual([
      {
        cardId: 'card_1',
        lane: 'retention',
        position: 4,
        injected: false,
      },
      {
        cardId: 'card_2',
        lane: 'calibration',
        position: 5,
        injected: true,
      },
    ]);
  });

  it('defaults malformed array items safely', async () => {
    httpGet.mockResolvedValue({
      success: true,
      data: [null],
    });

    const response = await queueApi.getQueue('session_456' as never);

    expect(response.data).toEqual({
      sessionId: '',
      items: [
        {
          cardId: '',
          lane: 'retention',
          position: 0,
          injected: false,
        },
      ],
      remaining: 0,
    });
  });
});
