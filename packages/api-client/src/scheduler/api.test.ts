import { beforeEach, describe, expect, it, vi } from 'vitest';

const { httpGet } = vi.hoisted(() => ({
  httpGet: vi.fn(),
}));

vi.mock('../client.js', () => ({
  http: {
    get: httpGet,
  },
}));

import * as schedulerModule from './index.js';
import { schedulerApi } from './api.js';

describe('scheduler concept-first api', () => {
  beforeEach(() => {
    httpGet.mockReset();
  });

  it('uses only the Batch 6 concept-first read endpoints', async () => {
    httpGet.mockResolvedValue({ data: {} });

    await schedulerApi.getDueConcepts({ studyMode: 'knowledge_gaining', limit: 10 });
    await schedulerApi.getConceptSchedule('concept_C' as never, {
      studyMode: 'knowledge_gaining',
    });
    await schedulerApi.getTransformationHistory('concept_C' as never, {
      studyMode: 'knowledge_gaining',
      limit: 3,
    });

    expect(httpGet).toHaveBeenNthCalledWith(1, '/v1/concepts/due', {
      params: { studyMode: 'knowledge_gaining', limit: 10 },
    });
    expect(httpGet).toHaveBeenNthCalledWith(2, '/v1/concepts/concept_C/schedule', {
      params: { studyMode: 'knowledge_gaining' },
    });
    expect(httpGet).toHaveBeenNthCalledWith(3, '/v1/concepts/concept_C/transformation-history', {
      params: { studyMode: 'knowledge_gaining', limit: 3 },
    });
  });

  it('does not export deleted card/cohort scheduler APIs', () => {
    expect(Object.keys(schedulerModule).sort()).toEqual([
      'schedulerApi',
      'schedulerKeys',
      'useConceptSchedule',
      'useDueConcepts',
      'useTransformationHistory',
    ]);
  });
});
