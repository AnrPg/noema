import type { ConceptId } from '@noema/types';

import { http } from '../client.js';
import type {
  ConceptScheduleQuery,
  ConceptScheduleResponse,
  DueConceptsQuery,
  DueConceptsResponse,
  TransformationHistoryQuery,
  TransformationHistoryResponse,
} from './types.js';

type QueryParams = Record<string, string | number | boolean | readonly string[] | undefined>;

function withParams(query: object | undefined): { params?: QueryParams } {
  return query === undefined ? {} : { params: query as QueryParams };
}

export const schedulerApi = {
  getDueConcepts: (query?: DueConceptsQuery): Promise<DueConceptsResponse> =>
    http.get('/v1/concepts/due', withParams(query)),

  getConceptSchedule: (
    conceptId: ConceptId,
    query: ConceptScheduleQuery
  ): Promise<ConceptScheduleResponse> =>
    http.get(`/v1/concepts/${conceptId}/schedule`, withParams(query)),

  getTransformationHistory: (
    conceptId: ConceptId,
    query?: TransformationHistoryQuery
  ): Promise<TransformationHistoryResponse> =>
    http.get(`/v1/concepts/${conceptId}/transformation-history`, withParams(query)),
};
