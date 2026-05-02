import type {
  ICurriculum,
  ICurriculumProgress,
  ICurriculumRevisionProposal,
  ICreateCurriculumInput,
  IApplyRevisionProposalInput,
  IFreezeNodeInput,
  IRealignmentEvidence,
  IRecordCurriculumEvaluationInput,
  IRecordRealignmentEvidenceInput,
  ISessionSlice,
  ISessionSliceRequest,
} from '@noema/contracts';

export type CurriculumResponse = { data: ICurriculum };
export type CurriculaResponse = { data: ICurriculum[] };
export type CurriculumProgressResponse = { data: ICurriculumProgress[] };
export type CurriculumProgressRecordResponse = { data: ICurriculumProgress };
export type CurriculumFrontierResponse = {
  data: ICurriculum['activeVersion'] extends infer Version
    ? Version extends { nodes: infer Nodes }
      ? Nodes
      : unknown[]
    : unknown[];
};
export type CurriculumSessionSliceResponse = { data: ISessionSlice };
export type RevisionProposalsResponse = { data: ICurriculumRevisionProposal[] };
export type RevisionProposalResponse = { data: ICurriculumRevisionProposal };
export type CurriculumActiveVersionResponse = { data: NonNullable<ICurriculum['activeVersion']> };
export type RealignmentEvidenceResponse = { data: IRealignmentEvidence[] };
export type RecordRealignmentEvidenceResponse = {
  data: { evidence: IRealignmentEvidence; proposalEligible: boolean };
};

export type {
  ICurriculum,
  ICurriculumProgress,
  ICurriculumRevisionProposal,
  IApplyRevisionProposalInput,
  ICreateCurriculumInput,
  IFreezeNodeInput,
  IRealignmentEvidence,
  IRecordCurriculumEvaluationInput,
  IRecordRealignmentEvidenceInput,
  ISessionSlice,
  ISessionSliceRequest,
};
