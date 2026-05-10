import { describe, expect, test } from 'vitest';
import type { ICurriculumRevisionProposal } from '@noema/api-client';
import type { IAgentRunResult } from '@noema/api-client/agents';
import {
  canApplyRevisionProposal,
  extractCurriculumOutline,
  extractImportedCurriculumDraft,
  extractImportedRevisionResult,
  formatCurriculumLabel,
  revisionProposalStats,
} from '../../features/curricula/helpers';

describe('curriculum helpers', () => {
  test('extracts imported curriculum ids from persisted batch results', () => {
    const run = {
      execution: {
        result: {
          artifactKind: 'curriculum_draft',
          response: {
            curriculumId: 'curr_123',
            curriculumVersionId: 'cver_123',
          },
        },
      },
    } as IAgentRunResult;

    expect(extractImportedCurriculumDraft(run)).toEqual({
      curriculumId: 'curr_123',
      curriculumVersionId: 'cver_123',
    });
  });

  test('extracts revision proposal imports from persistence responses', () => {
    const run = {
      execution: {
        result: {
          artifactKind: 'curriculum_revision',
          persistence: {
            response: {
              curriculumId: 'curr_123',
              proposalId: 'rprop_123',
              proposalCreated: true,
            },
          },
        },
      },
    } as IAgentRunResult;

    expect(extractImportedRevisionResult(run)).toEqual({
      curriculumId: 'curr_123',
      proposalId: 'rprop_123',
      proposalCreated: true,
    });
  });

  test('extracts revision runs that finish with no proposal', () => {
    const run = {
      execution: {
        result: {
          response: {
            curriculumId: 'curr_123',
            status: 'ignored_no_changes',
            proposalCreated: false,
          },
        },
      },
    } as IAgentRunResult;

    expect(extractImportedRevisionResult(run)).toEqual({
      curriculumId: 'curr_123',
      status: 'ignored_no_changes',
      proposalCreated: false,
    });
  });

  test('extracts exploratory curriculum-outline artifacts for concept approval', () => {
    const run = {
      execution: {
        result: {
          artifactKind: 'curriculum_outline',
          goal: 'Understand gut microbiota and neurodegeneration.',
          goalSummary: 'Analyze the goal before drafting the durable curriculum.',
          candidateConcepts: [
            {
              label: 'Microbiology',
              whySuggested: 'Named in the goal context.',
              confidenceLabel: 'high',
              clusterLabel: 'Domain anchors',
              requiresProvisionalPkgCreation: true,
            },
          ],
          candidateGroups: [{ label: 'Domain anchors', conceptLabels: ['Microbiology'] }],
          ambiguityNotes: ['The goal spans multiple biological subfields.'],
          prerequisiteThemes: [
            {
              label: 'Biological systems framing',
              whyItMatters: 'Supports later disease material.',
            },
          ],
          provisionalOutline: [
            {
              title: 'Confirm the conceptual foundations',
              reason: 'Start with the likely prerequisites.',
              conceptLabels: ['Microbiology'],
            },
          ],
          readiness: {
            isReadyForConceptApproval: true,
            requiresLearnerConfirmation: true,
            blockingIssues: [],
          },
          rationale: 'Reviewed anchors should come before durable drafting.',
        },
      },
    } as IAgentRunResult;

    expect(extractCurriculumOutline(run)).toEqual({
      goal: 'Understand gut microbiota and neurodegeneration.',
      goalSummary: 'Analyze the goal before drafting the durable curriculum.',
      candidateConcepts: [
        {
          label: 'Microbiology',
          whySuggested: 'Named in the goal context.',
          confidenceLabel: 'high',
          clusterLabel: 'Domain anchors',
          suggestedDomain: null,
          matchedConceptId: null,
          matchedGraphSource: null,
          requiresProvisionalPkgCreation: true,
        },
      ],
      candidateGroups: [{ label: 'Domain anchors', conceptLabels: ['Microbiology'] }],
      ambiguityNotes: ['The goal spans multiple biological subfields.'],
      prerequisiteThemes: [
        {
          label: 'Biological systems framing',
          whyItMatters: 'Supports later disease material.',
        },
      ],
      provisionalOutline: [
        {
          title: 'Confirm the conceptual foundations',
          reason: 'Start with the likely prerequisites.',
          conceptLabels: ['Microbiology'],
        },
      ],
      readiness: {
        isReadyForConceptApproval: true,
        requiresLearnerConfirmation: true,
        blockingIssues: [],
      },
      rationale: 'Reviewed anchors should come before durable drafting.',
      title: undefined,
      summary: undefined,
    });
  });

  test('formats enum-like values into readable labels', () => {
    expect(formatCurriculumLabel('document_derived')).toBe('Document Derived');
    expect(formatCurriculumLabel('user-edit')).toBe('User Edit');
  });

  test('summarizes revision proposal state counts and apply readiness', () => {
    const proposal = {
      id: 'rprop_1',
      curriculumId: 'curr_1',
      proposedFromVersionId: 'cver_1',
      reason: 'user_edit',
      evidence: {},
      rationale: 'Needs refinement.',
      expiresAt: '2026-05-10T00:00:00.000Z',
      createdAt: '2026-05-09T00:00:00.000Z',
      changes: [
        {
          id: 'rchg_1',
          proposalId: 'rprop_1',
          kind: 'reorder',
          payload: {},
          state: 'approved',
        },
        {
          id: 'rchg_2',
          proposalId: 'rprop_1',
          kind: 'add_node',
          payload: {},
          state: 'pending',
        },
      ],
    } as ICurriculumRevisionProposal;

    expect(revisionProposalStats(proposal)).toEqual({
      total: 2,
      pending: 1,
      approved: 1,
      rejected: 0,
      applied: 0,
    });
    expect(canApplyRevisionProposal(proposal)).toBe(true);
  });
});
