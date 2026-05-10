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

import { sessionsApi, stepsApi } from './api.js';

describe('session Step-loop api', () => {
  beforeEach(() => {
    httpGet.mockReset();
    httpPost.mockReset();
  });

  it('fetches the next Step-loop snapshot from the Batch 4 endpoint', async () => {
    const response = {
      data: {
        session: { id: 'session_123' },
        lessonPlan: { id: 'lplan_123' },
        nextStep: null,
      },
    };
    httpGet.mockResolvedValue(response);

    await expect(sessionsApi.getNextStep('session_123' as never)).resolves.toEqual(response);

    expect(httpGet).toHaveBeenCalledWith('/v1/sessions/session_123/next-step');
  });

  it('lists sessions through the paginated sessions envelope', async () => {
    const response = {
      data: {
        sessions: [{ id: 'session_123' }],
        total: 1,
      },
    };
    httpGet.mockResolvedValue(response);

    await expect(sessionsApi.listSessions({ limit: 5 })).resolves.toEqual(response);

    expect(httpGet).toHaveBeenCalledWith('/v1/sessions', { params: { limit: 5 } });
  });

  it('answers Steps through the canonical Step endpoint', async () => {
    httpPost.mockResolvedValue({ data: { id: 'step_123' } });
    const input = {
      correct: true,
      selfRating: 'knew_it',
      trace: {
        frames: {
          f0: { score: 0.8, notes: 'goal clear' },
          f1: { score: 0.8, notes: 'parsed prompt' },
          f2: { score: 0.8, notes: 'selected diagnostic cue' },
          f3: { score: 0.8, notes: 'retrieved from memory' },
          f4: { score: 0.8, notes: 'reasoned through response' },
          f5: { score: 0.8, notes: 'checked answer' },
          f6: { score: 0.8, notes: 'attributed outcome' },
        },
      },
    } as const;

    await stepsApi.answerStep('step_123' as never, input);

    expect(httpPost).toHaveBeenCalledWith('/v1/steps/step_123/answer', input);
  });
});
