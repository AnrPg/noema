import type { ICurriculumRevisionProposal } from '@noema/api-client';
import type { IAgentRunResult } from '@noema/api-client/agents';

export interface IImportedCurriculumDraftLocation {
  curriculumId: string;
  curriculumVersionId?: string | undefined;
}

export interface ICurriculumOutlineConceptCandidate {
  label: string;
  whySuggested: string;
  confidenceLabel: string;
  clusterLabel: string;
  suggestedDomain: string | null;
  matchedConceptId: string | null;
  matchedGraphSource: string | null;
  requiresProvisionalPkgCreation: boolean;
}

export interface ICurriculumOutlineProposal {
  goal: string;
  goalSummary: string;
  candidateConcepts: ICurriculumOutlineConceptCandidate[];
  candidateGroups: Array<{
    label: string;
    conceptLabels: string[];
  }>;
  ambiguityNotes: string[];
  prerequisiteThemes: Array<{
    label: string;
    whyItMatters: string;
  }>;
  provisionalOutline: Array<{
    title: string;
    reason: string;
    conceptLabels: string[];
  }>;
  readiness: {
    isReadyForConceptApproval: boolean;
    requiresLearnerConfirmation: boolean;
    blockingIssues: string[];
  };
  rationale: string;
  title?: string | undefined;
  summary?: string | undefined;
}

export interface IImportedRevisionResult {
  curriculumId: string;
  proposalId?: string | undefined;
  status?: string | undefined;
  proposalCreated?: boolean | undefined;
}

export interface IRevisionProposalStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  applied: number;
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function findImportSource(result: Record<string, unknown>): Record<string, unknown> {
  const response = toRecord(result['response']);
  const embeddedResponse = toRecord(response['response']);
  const persistence = toRecord(result['persistence']);
  const persistenceResponse = toRecord(persistence['response']);
  const nestedResult = toRecord(result['result']);

  if (readString(response['curriculumId']) !== null || readString(response['proposalId']) !== null) {
    return response;
  }

  if (
    readString(embeddedResponse['curriculumId']) !== null ||
    readString(embeddedResponse['proposalId']) !== null
  ) {
    return embeddedResponse;
  }

  if (
    readString(persistenceResponse['curriculumId']) !== null ||
    readString(persistenceResponse['proposalId']) !== null
  ) {
    return persistenceResponse;
  }

  if (readString(nestedResult['curriculumId']) !== null || readString(nestedResult['proposalId']) !== null) {
    return nestedResult;
  }

  return result;
}

function findExecutionResult(run: IAgentRunResult | undefined): Record<string, unknown> {
  if (run === undefined) return {};
  const execution = toRecord(run.execution);
  return toRecord(execution['result']);
}

export function extractImportedCurriculumDraft(
  run: IAgentRunResult | undefined
): IImportedCurriculumDraftLocation | null {
  if (run === undefined) return null;

  const result = findExecutionResult(run);
  const source = findImportSource(result);

  const curriculumId = readString(source['curriculumId']);
  if (curriculumId === null) return null;

  const curriculumVersionId = readString(source['curriculumVersionId']);
  return curriculumVersionId === null
    ? { curriculumId }
    : { curriculumId, curriculumVersionId };
}

export function extractImportedRevisionResult(
  run: IAgentRunResult | undefined
): IImportedRevisionResult | null {
  if (run === undefined) return null;

  const result = findExecutionResult(run);
  const source = findImportSource(result);

  const curriculumId = readString(source['curriculumId']);
  if (curriculumId === null) return null;

  const proposalId = readString(source['proposalId']);
  const status = readString(source['status']);
  const proposalCreated = readBoolean(source['proposalCreated']);

  return {
    curriculumId,
    ...(proposalId === null ? {} : { proposalId }),
    ...(status === null ? {} : { status }),
    ...(proposalCreated === undefined ? {} : { proposalCreated }),
  };
}

export function extractCurriculumOutline(
  run: IAgentRunResult | undefined
): ICurriculumOutlineProposal | null {
  const result = findExecutionResult(run);
  const artifactKind = readString(result['artifactKind']);
  if (artifactKind !== null && artifactKind !== 'curriculum_outline') {
    return null;
  }

  const goal = readString(result['goal']);
  const goalSummary = readString(result['goalSummary']);
  const rationale = readString(result['rationale']);
  if (goal === null || goalSummary === null || rationale === null) {
    return null;
  }

  const candidateConcepts = Array.isArray(result['candidateConcepts'])
    ? result['candidateConcepts']
        .map((value) => {
          const item = toRecord(value);
          const label = readString(item['label']);
          const whySuggested = readString(item['whySuggested']);
          const confidenceLabel = readString(item['confidenceLabel']);
          const clusterLabel = readString(item['clusterLabel']);
          if (
            label === null ||
            whySuggested === null ||
            confidenceLabel === null ||
            clusterLabel === null
          ) {
            return null;
          }
          return {
            label,
            whySuggested,
            confidenceLabel,
            clusterLabel,
            suggestedDomain: readString(item['suggestedDomain']),
            matchedConceptId: readString(item['matchedConceptId']),
            matchedGraphSource: readString(item['matchedGraphSource']),
            requiresProvisionalPkgCreation:
              typeof item['requiresProvisionalPkgCreation'] === 'boolean'
                ? item['requiresProvisionalPkgCreation']
                : true,
          } satisfies ICurriculumOutlineConceptCandidate;
        })
        .filter((value): value is ICurriculumOutlineConceptCandidate => value !== null)
    : [];

  const candidateGroups = Array.isArray(result['candidateGroups'])
    ? result['candidateGroups']
        .map((value) => {
          const item = toRecord(value);
          const label = readString(item['label']);
          if (label === null) return null;
          return {
            label,
            conceptLabels: Array.isArray(item['conceptLabels'])
              ? item['conceptLabels'].filter((entry): entry is string => typeof entry === 'string')
              : [],
          };
        })
        .filter(
          (
            value
          ): value is {
            label: string;
            conceptLabels: string[];
          } => value !== null
        )
    : [];

  const ambiguityNotes = Array.isArray(result['ambiguityNotes'])
    ? result['ambiguityNotes'].filter((value): value is string => typeof value === 'string')
    : [];

  const prerequisiteThemes = Array.isArray(result['prerequisiteThemes'])
    ? result['prerequisiteThemes']
        .map((value) => {
          const item = toRecord(value);
          const label = readString(item['label']);
          const whyItMatters = readString(item['whyItMatters']);
          return label === null || whyItMatters === null ? null : { label, whyItMatters };
        })
        .filter((value): value is { label: string; whyItMatters: string } => value !== null)
    : [];

  const provisionalOutline = Array.isArray(result['provisionalOutline'])
    ? result['provisionalOutline']
        .map((value) => {
          const item = toRecord(value);
          const title = readString(item['title']);
          const reason = readString(item['reason']);
          return title === null || reason === null
            ? null
            : {
                title,
                reason,
                conceptLabels: Array.isArray(item['conceptLabels'])
                  ? item['conceptLabels'].filter((entry): entry is string => typeof entry === 'string')
                  : [],
              };
        })
        .filter(
          (
            value
          ): value is {
            title: string;
            reason: string;
            conceptLabels: string[];
          } => value !== null
        )
    : [];

  const readinessSource = toRecord(result['readiness']);
  return {
    goal,
    goalSummary,
    candidateConcepts,
    candidateGroups,
    ambiguityNotes,
    prerequisiteThemes,
    provisionalOutline,
    readiness: {
      isReadyForConceptApproval:
        typeof readinessSource['isReadyForConceptApproval'] === 'boolean'
          ? readinessSource['isReadyForConceptApproval']
          : candidateConcepts.length > 0,
      requiresLearnerConfirmation:
        typeof readinessSource['requiresLearnerConfirmation'] === 'boolean'
          ? readinessSource['requiresLearnerConfirmation']
          : true,
      blockingIssues: Array.isArray(readinessSource['blockingIssues'])
        ? readinessSource['blockingIssues'].filter((value): value is string => typeof value === 'string')
        : [],
    },
    rationale,
    title: readString(result['title']) ?? undefined,
    summary: readString(result['summary']) ?? undefined,
  };
}

export function formatCurriculumLabel(value: string): string {
  if (value.trim() === '') return 'Unknown';
  return value
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function revisionProposalStats(
  proposal: ICurriculumRevisionProposal
): IRevisionProposalStats {
  const stats: IRevisionProposalStats = {
    total: proposal.changes.length,
    pending: 0,
    approved: 0,
    rejected: 0,
    applied: 0,
  };

  for (const change of proposal.changes) {
    if (change.state === 'approved') stats.approved += 1;
    else if (change.state === 'rejected') stats.rejected += 1;
    else if (change.state === 'applied') stats.applied += 1;
    else stats.pending += 1;
  }

  return stats;
}

export function canApplyRevisionProposal(proposal: ICurriculumRevisionProposal): boolean {
  if (proposal.appliedVersionId !== undefined) return false;
  const stats = revisionProposalStats(proposal);
  return stats.approved > 0;
}
