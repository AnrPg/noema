import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { AgentActionButton, ProposalJobStatusCard, ProposalReviewPanel } from './components';
import type { IAgentProposal } from './types';

const mockUseContextualAgent = vi.fn();

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@noema/ui', () => ({
  Button: ({
    children,
    asChild,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild === true ? <>{children}</> : <button {...props}>{children}</button>,
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock('./use-contextual-agent', () => ({
  useContextualAgent: (...args: unknown[]) => mockUseContextualAgent(...args),
}));

function buildProposal(overrides: Partial<IAgentProposal> = {}): IAgentProposal {
  return {
    id: 'run_1',
    agentName: 'knowledge-graph-agent',
    title: 'Knowledge Graph Agent',
    summary: 'Graph proposal context assembled for 1 selected concept.',
    state: 'needs_review',
    headline: 'A graph proposal is ready for your review.',
    recommendedAction:
      'A graph proposal is ready. Review the suggested concept links and apply only the ones you want.',
    nextStepLabel: 'Review graph suggestions',
    nextStepDescription:
      'Open the review workspace to inspect proposed links and apply only the ones you want.',
    reasons: [
      "Tool belt 'knowledge-graph-belt' governs the run.",
      'Run produces proposal-like output and must route through review.',
    ],
    friendlyReasons: ['This agent prepares suggestions for you to review before anything changes.'],
    caution: 'Nothing changes automatically. Review the draft before applying anything.',
    review: undefined,
    rawResult: undefined,
    technicalDetails: {
      runId: 'run_1',
      jobId: 'job_1',
      agentName: 'knowledge-graph-agent',
      provider: 'openai',
      model: 'gpt-test',
      promptTemplateId: 'tpl_1',
      reviewQueue: 'knowledge-graph-review-queue',
      serviceRefs: {},
      reviewRequired: true,
      rawReasons: [
        "Tool belt 'knowledge-graph-belt' governs the run.",
        'Run produces proposal-like output and must route through review.',
      ],
      blockedReasons: [],
    },
    provenance: {
      runId: 'run_1',
      jobId: 'job_1',
      agentName: 'knowledge-graph-agent',
      provider: 'openai',
      model: 'gpt-test',
      promptTemplateId: 'tpl_1',
      reviewQueue: 'knowledge-graph-review-queue',
      serviceRefs: {},
    },
    ...overrides,
  };
}

function buildJob(overrides: Record<string, unknown> = {}) {
  return {
    jobId: 'job_1',
    runId: 'run_1',
    agentName: 'knowledge-graph-agent',
    provider: 'openai',
    model: 'gpt-test',
    executionStrategy: 'batch',
    status: 'queued',
    request: {},
    result: null,
    errorMessage: null,
    submittedAt: null,
    providerSubmittedAt: null,
    completedAt: null,
    createdAt: '2026-05-10T09:00:00.000Z',
    updatedAt: '2026-05-10T09:00:00.000Z',
    isCancellable: true,
    cancellationWindow: 'pre_submit_only' as const,
    ...overrides,
  };
}

describe('ProposalReviewPanel', () => {
  test('shows learner-facing review guidance and hides raw runtime language by default', () => {
    render(<ProposalReviewPanel proposal={buildProposal()} />);

    expect(screen.getByText('A graph proposal is ready for your review.')).toBeInTheDocument();
    expect(screen.getByText('What this helps with')).toBeInTheDocument();
    expect(screen.getByText('What the agent is preparing')).toBeInTheDocument();
    expect(screen.getByText('Your next step')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review graph suggestions' })).toHaveAttribute(
      'href',
      '/knowledge?workspace=review&agent=knowledge-graph-agent&jobId=job_1&runId=run_1'
    );
    expect(screen.queryByText(/tool belt/i)).not.toBeInTheDocument();
  });

  test('reveals raw details only after opening the technical drawer', () => {
    render(<ProposalReviewPanel proposal={buildProposal()} />);

    fireEvent.click(screen.getByRole('button', { name: /technical details/i }));

    expect(screen.getByText(/knowledge-graph-belt/i)).toBeInTheDocument();
  });

  test('shows a plain-language blocker for blocked proposals', () => {
    render(
      <ProposalReviewPanel
        proposal={buildProposal({
          state: 'blocked',
          headline: 'This graph request needs a little more setup before the agent can help.',
          nextStepLabel: 'Fix the setup first',
          nextStepDescription: 'Choose concepts the graph can recognize, then try again.',
          friendlyReasons: [
            'At least one selected concept could not be matched to the graph yet.',
          ],
          caution: 'At least one selected concept could not be matched to the graph yet.',
        })}
      />
    );

    expect(
      screen.getAllByText('At least one selected concept could not be matched to the graph yet.')
    ).toHaveLength(2);
  });
});

describe('AgentActionButton', () => {
  test('mounts contextual agent logic only after opening the dialog', () => {
    mockUseContextualAgent.mockReturnValue({
      canRun: true,
      contextMissing: [],
      isChecking: false,
      isRunning: false,
      isCancelling: false,
      runError: null,
      proposal: null,
      latestRun: undefined,
      jobId: null,
      batchJob: null,
      proposalJobPhase: 'idle',
      canCancelJob: false,
      check: vi.fn(),
      run: vi.fn(),
      cancelJob: vi.fn(),
    });

    render(<AgentActionButton agentName="knowledge-graph-agent" label="Draft graph suggestions" />);

    expect(mockUseContextualAgent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /draft graph suggestions/i }));

    expect(mockUseContextualAgent).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Ready when useful')).toBeInTheDocument();
  });

  test('surfaces cancel request prominently when a batch proposal is still locally queued', () => {
    mockUseContextualAgent.mockReturnValue({
      canRun: true,
      contextMissing: [],
      isChecking: false,
      isRunning: true,
      isCancelling: false,
      runError: null,
      proposal: null,
      latestRun: undefined,
      jobId: 'job_1',
      batchJob: buildJob(),
      proposalJobPhase: 'queued_local',
      canCancelJob: true,
      check: vi.fn(),
      run: vi.fn(),
      cancelJob: vi.fn(),
    });

    render(<AgentActionButton agentName="knowledge-graph-agent" label="Draft graph suggestions" />);
    fireEvent.click(screen.getByRole('button', { name: /draft graph suggestions/i }));

    expect(screen.getAllByRole('button', { name: 'Cancel request' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Proposal request queued locally')).toBeInTheDocument();
  });
});

describe('ProposalJobStatusCard', () => {
  test('shows honest pre-submit cancellation copy only while the request is locally queued', () => {
    render(
      <ProposalJobStatusCard
        job={buildJob()}
        phase="queued_local"
        canCancel
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('Queued locally')).toBeInTheDocument();
    expect(
      screen.getByText('This stops the proposal request before provider submission.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel request' })).toBeInTheDocument();
  });

  test('hides the cancel action once provider submission has started', () => {
    render(
      <ProposalJobStatusCard
        job={buildJob({
          status: 'submitted',
          isCancellable: false,
          cancellationWindow: 'none',
          submittedAt: '2026-05-10T09:00:10.000Z',
          providerSubmittedAt: '2026-05-10T09:00:10.000Z',
        })}
        phase="submitted_provider"
        canCancel={false}
      />
    );

    expect(screen.getByText('Submitted to provider')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeInTheDocument();
  });
});
