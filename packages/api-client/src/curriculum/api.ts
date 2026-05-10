import type { CurriculumId, RevisionChangeId, RevisionProposalId } from '@noema/types';
import { http } from '../client.js';
import type {
  CurriculaResponse,
  CurriculumActiveVersionResponse,
  CurriculumFrontierResponse,
  CurriculumProgressRecordResponse,
  CurriculumProgressResponse,
  CurriculumResponse,
  CurriculumSessionSliceResponse,
  IApplyRevisionProposalInput,
  ICreateCurriculumInput,
  IFreezeNodeInput,
  IRecordCurriculumEvaluationInput,
  IRecordRealignmentEvidenceInput,
  ISessionSliceRequest,
  RealignmentEvidenceResponse,
  RecordRealignmentEvidenceResponse,
  RevisionProposalResponse,
  RevisionProposalsResponse,
} from './types.js';

export const curriculumApi = {
  listCurricula: (): Promise<CurriculaResponse> => http.get('/v1/curricula'),
  createCurriculum: (data: ICreateCurriculumInput): Promise<CurriculumResponse> =>
    http.post('/v1/curricula', data),
  getCurriculum: (id: CurriculumId): Promise<CurriculumResponse> => http.get(`/v1/curricula/${id}`),
  getActiveVersion: (id: CurriculumId): Promise<CurriculumActiveVersionResponse> =>
    http.get(`/v1/curricula/${id}/active-version`),
  getFrontier: (id: CurriculumId): Promise<CurriculumFrontierResponse> =>
    http.get(`/v1/curricula/${id}/frontier`),
  getProgress: (id: CurriculumId): Promise<CurriculumProgressResponse> =>
    http.get(`/v1/curricula/${id}/progress`),
  recordEvaluation: (
    id: CurriculumId,
    data: IRecordCurriculumEvaluationInput
  ): Promise<CurriculumProgressRecordResponse> =>
    http.post(`/v1/curricula/${id}/progress/evaluations`, data),
  getSessionSlice: (
    id: CurriculumId,
    data: ISessionSliceRequest
  ): Promise<CurriculumSessionSliceResponse> =>
    http.post(`/v1/curricula/${id}/session-slice`, data),
  listRevisionProposals: (id: CurriculumId): Promise<RevisionProposalsResponse> =>
    http.get(`/v1/curricula/${id}/revision-proposals`),
  decideRevisionChange: (
    id: CurriculumId,
    proposalId: RevisionProposalId,
    changeId: RevisionChangeId,
    state: 'approved' | 'rejected'
  ): Promise<RevisionProposalResponse> =>
    http.patch(`/v1/curricula/${id}/revision-proposals/${proposalId}/changes/${changeId}`, {
      state,
    }),
  applyRevisionProposal: (
    id: CurriculumId,
    proposalId: RevisionProposalId,
    data: IApplyRevisionProposalInput = {}
  ): Promise<RevisionProposalResponse> =>
    http.post(`/v1/curricula/${id}/revision-proposals/${proposalId}/apply`, data),
  freezeNode: (id: CurriculumId, data: IFreezeNodeInput): Promise<void> =>
    http.post(`/v1/curricula/${id}/freeze-node`, data),
  unfreezeNode: (id: CurriculumId, data: IFreezeNodeInput): Promise<void> =>
    http.post(`/v1/curricula/${id}/unfreeze-node`, data),
  listRealignmentEvidence: (id: CurriculumId): Promise<RealignmentEvidenceResponse> =>
    http.get(`/v1/curricula/${id}/realignment-evidence`),
  recordRealignmentEvidence: (
    id: CurriculumId,
    data: IRecordRealignmentEvidenceInput
  ): Promise<RecordRealignmentEvidenceResponse> =>
    http.post(`/v1/curricula/${id}/realignment-evidence`, data),
};
