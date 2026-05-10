import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, test, vi } from 'vitest';
import NewCurriculumPage from './page.js';

const { createNodeMock, createCurriculumMock, outlineRunMock, durableRunMock, routerPushMock } =
  vi.hoisted(() => ({
    createNodeMock: vi.fn(),
    createCurriculumMock: vi.fn(),
    outlineRunMock: vi.fn(),
    durableRunMock: vi.fn(),
    routerPushMock: vi.fn(),
  }));

vi.mock('@noema/auth', () => ({
  useAuth: () => ({
    user: { id: 'user_1', displayName: 'Test User', email: 'test@example.com', avatarUrl: null },
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock, back: vi.fn() }),
}));

vi.mock('@/hooks/use-active-study-mode', () => ({
  useActiveStudyMode: () => 'knowledge_gaining',
}));

vi.mock('@/features/agents', () => ({
  ProposalJobStatusCard: () => null,
  useContextualAgent: ({ agentName }: { agentName: string }) =>
    agentName === 'curriculum-outline-planner'
      ? {
          canRun: true,
          contextMissing: [],
          isChecking: false,
          isRunning: false,
          isCancelling: false,
          runError: null,
          proposal: null,
          latestRun: {
            runId: 'run_outline_1',
            execution: {
              result: {
                artifactKind: 'curriculum_outline',
                goal: 'Understand gut microbiota and neurodegeneration.',
                goalSummary: 'Review candidate concept anchors before durable drafting.',
                candidateConcepts: [
                  {
                    label: 'Microbiology',
                    whySuggested: 'It appears directly in the goal context.',
                    confidenceLabel: 'high',
                    clusterLabel: 'Domain anchors',
                    matchedConceptId: 'concept_microbiology',
                    matchedGraphSource: 'ckg',
                    requiresProvisionalPkgCreation: false,
                  },
                ],
                candidateGroups: [
                  { label: 'Domain anchors', conceptLabels: ['Microbiology'] },
                ],
                ambiguityNotes: [],
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
          },
          jobId: null,
          batchJob: null,
          proposalJobPhase: 'completed',
          canCancelJob: false,
          check: vi.fn(),
          run: outlineRunMock,
          cancelJob: vi.fn(),
        }
      : {
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
          run: durableRunMock,
          cancelJob: vi.fn(),
        },
}));

vi.mock('@noema/api-client', () => ({
  curriculumKeys: {
    list: () => ['curricula'],
    detail: (id: string) => ['curricula', id],
  },
  useCreateCurriculum: () => ({
    mutateAsync: createCurriculumMock,
    isPending: false,
    error: null,
  }),
  useCreatePKGNode: () => ({
    mutateAsync: createNodeMock,
    isPending: false,
    error: null,
  }),
  useDomainSuggestions: () => ({
    data: {
      resolvedDomain: 'biology',
      needsDecision: false,
      suggestions: [],
      proposedDomains: [],
    },
  }),
  usePKGNodes: () => ({
    data: [],
    isLoading: false,
  }),
  useCKGNodes: () => ({
    data: [],
    isLoading: false,
  }),
}));

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <NewCurriculumPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  createNodeMock.mockReset();
  createCurriculumMock.mockReset();
  outlineRunMock.mockReset();
  durableRunMock.mockReset();
  routerPushMock.mockReset();
  createNodeMock.mockResolvedValue({
    data: {
      id: 'node_gut_brain_axis',
      label: 'Gut-brain axis',
    },
  });
});

test('creates a provisional PKG concept before triggering the durable curriculum draft', async () => {
  renderPage();

  await waitFor(() => {
    expect(screen.getAllByText('Microbiology').length).toBeGreaterThan(0);
  });

  fireEvent.change(screen.getByPlaceholderText(/add a missing concept/i), {
    target: { value: 'Gut-brain axis' },
  });

  fireEvent.click(screen.getByRole('button', { name: /add as provisional concept/i }));
  fireEvent.click(screen.getByRole('button', { name: /create curriculum draft/i }));

  await waitFor(() => {
    expect(createNodeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Gut-brain axis',
        domain: 'biology',
        supportedStudyModes: ['knowledge_gaining'],
      })
    );
  });

  await waitFor(() => {
    expect(durableRunMock).toHaveBeenCalledTimes(1);
  });
});
