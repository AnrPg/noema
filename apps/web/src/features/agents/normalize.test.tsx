import { describe, expect, test } from 'vitest';
import type { IAgentBatchJob, IAgentRunResult } from '@noema/api-client/agents';
import {
  normalizeAgentBatchProposal,
  normalizeAgentProposal,
  proposalJobPhase,
  reviewStateLabel,
} from './normalize';

function buildRunResult(
  overrides: Partial<IAgentRunResult> = {},
  preflightOverrides: Partial<IAgentRunResult['preflight']> = {}
): IAgentRunResult {
  return {
    runId: 'run_1',
    agent: {} as IAgentRunResult['agent'],
    request: { userId: 'user_1', conceptIds: ['Bayes theorem'] },
    preflight: {
      allowed: true,
      riskLevel: 'high',
      requiresReview: true,
      reviewQueue: 'knowledge-graph-review-queue',
      reviewPath: ['knowledge-graph-review-queue'],
      reasons: [
        "Tool belt 'knowledge-graph-belt' governs the run.",
        'Run produces proposal-like output and must route through review.',
      ],
      blockedReasons: [],
      allowedActions: [],
      deniedActions: [],
      ...preflightOverrides,
    },
    status: 'completed',
    provider: 'openai',
    model: 'gpt-test',
    contextPack: {},
    prompt: { templateId: 'tpl_1', systemInstructions: [], slots: {} },
    execution: {
      result: {
        title: 'Knowledge Graph Agent',
        summary: 'Graph proposal context assembled for the selected concepts.',
      },
    },
    ...overrides,
  } as IAgentRunResult;
}

function buildBatchJob(overrides: Partial<IAgentBatchJob> = {}): IAgentBatchJob {
  return {
    jobId: 'job_1',
    runId: 'run_1',
    agentName: 'knowledge-graph-agent',
    provider: 'google',
    model: 'gemini-2.5-pro',
    executionStrategy: 'batch',
    status: 'completed',
    request: {
      userId: 'user_1',
      conceptIds: ['node_1'],
    },
    result: {
      result: {
        artifactKind: 'graph_proposals',
        proposalCount: 2,
        notes: 'Two graph suggestions are ready for review.',
        proposals: [
          { proposalId: 'proposal_1', candidateLabel: 'Microbiology', rationale: 'Anchor the concept.' },
        ],
      },
    },
    submittedAt: '2026-05-10T00:00:30.000Z',
    providerSubmittedAt: '2026-05-10T00:00:30.000Z',
    completedAt: '2026-05-10T00:01:00.000Z',
    isCancellable: false,
    cancellationWindow: 'none',
    createdAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-05-10T00:01:00.000Z',
    ...overrides,
  };
}

describe('normalizeAgentProposal', () => {
  test('turns graph review runs into clear learner-facing guidance', () => {
    const proposal = normalizeAgentProposal('knowledge-graph-agent', buildRunResult());

    expect(proposal).not.toBeNull();
    expect(proposal?.headline).toBe('A graph proposal is ready for your review.');
    expect(proposal?.nextStepLabel).toBe('Review graph suggestions');
    expect(proposal?.recommendedAction).toBe(
      'A graph proposal is ready. Review the suggested concept links and apply only the ones you want.'
    );
    expect(proposal?.friendlyReasons).toEqual([
      'This agent prepares suggestions for you to review before anything changes.',
    ]);
    expect(proposal?.technicalDetails.rawReasons).toContain(
      "Tool belt 'knowledge-graph-belt' governs the run."
    );
  });

  test('maps blocked graph errors into plain-language caution', () => {
    const proposal = normalizeAgentProposal(
      'knowledge-graph-agent',
      buildRunResult(
        { status: 'failed' },
        {
          allowed: false,
          requiresReview: false,
          blockedReasons: ['Bayes theorem: unresolved graph node ID.'],
          reasons: [],
        }
      )
    );

    expect(proposal).not.toBeNull();
    expect(proposal?.state).toBe('blocked');
    expect(proposal?.friendlyReasons).toEqual([
      'At least one selected concept could not be matched to the graph yet.',
    ]);
    expect(proposal?.caution).toBe('At least one selected concept could not be matched to the graph yet.');
  });

  test('uses user-facing review labels', () => {
    expect(reviewStateLabel('needs_review')).toBe('Ready for your review');
    expect(reviewStateLabel('running')).toBe('Building proposal');
    expect(reviewStateLabel('cancelled')).toBe('Cancelled');
    expect(reviewStateLabel('blocked')).toBe('Needs setup');
  });

  test('distinguishes locally queued jobs from provider-submitted ones', () => {
    expect(
      proposalJobPhase(
        buildBatchJob({
          status: 'queued',
          submittedAt: null,
          providerSubmittedAt: null,
          isCancellable: true,
          cancellationWindow: 'pre_submit_only',
        })
      )
    ).toBe('queued_local');
    expect(
      proposalJobPhase(
        buildBatchJob({
          status: 'submitted',
          isCancellable: false,
          cancellationWindow: 'none',
        })
      )
    ).toBe('submitted_provider');
  });

  test('normalizes completed batch jobs into reviewable graph proposals', () => {
    const proposal = normalizeAgentBatchProposal('knowledge-graph-agent', buildBatchJob());

    expect(proposal).not.toBeNull();
    expect(proposal?.state).toBe('needs_review');
    expect(proposal?.summary).toBe('Two graph suggestions are ready for review.');
    expect(proposal?.provenance.jobId).toBe('job_1');
  });
});
