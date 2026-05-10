import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AgentWorkbench } from './agent-workbench.js';

const useAgentsMock = vi.fn();
const useAgentMock = vi.fn();
const useAgentToolsMock = vi.fn();
const useCardsMock = vi.fn();
const useCurriculaMock = vi.fn();
const useIngestionDocumentsMock = vi.fn();
const useNextStepMock = vi.fn();
const useSessionsMock = vi.fn();
const preflightMutateAsyncMock = vi.fn();
const runMutateAsyncMock = vi.fn();
const useAgentPreflightMock = vi.fn();
const useAgentRunMock = vi.fn();

vi.mock('@noema/auth', () => ({
  useAuth: () => ({
    user: {
      id: 'user_1',
      displayName: 'Test User',
      email: 'test@example.com',
      avatarUrl: null,
    },
  }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('agent=cognitive-copilot'),
}));

vi.mock('@noema/api-client/agents', () => ({
  useAgents: () => useAgentsMock(),
  useAgent: (...args: unknown[]) => useAgentMock(...args),
  useAgentTools: () => useAgentToolsMock(),
  useAgentPreflight: (...args: unknown[]) => useAgentPreflightMock(...args),
  useAgentRun: (...args: unknown[]) => useAgentRunMock(...args),
}));

vi.mock('@noema/api-client', () => ({
  useCards: () => useCardsMock(),
  useCurricula: () => useCurriculaMock(),
  useIngestionDocuments: () => useIngestionDocumentsMock(),
  useNextStep: (...args: unknown[]) => useNextStepMock(...args),
  useSessions: (...args: unknown[]) => useSessionsMock(...args),
}));

vi.mock('@/lib/api-errors', () => ({
  formatApiErrorMessage: (_error: unknown, options: { fallback: string }) => options.fallback,
}));

const cognitiveCopilot = {
  name: 'cognitive-copilot',
  family: 'learner-loop',
  purpose: 'Explain the current learning state in a structured, learner-safe way.',
  executionMode: 'preview',
  toolBeltId: 'copilot-belt',
  primaryCompositeTool: 'get-session-explanation-pack',
  outputKind: 'explanation',
  writeAuthority: 'agent_inference',
  reviewPath: ['watchtower'],
  instructions: [],
  requiredFields: ['userId', 'sessionId'],
  toolBelt: {
    id: 'copilot-belt',
    description: 'Read-only explanation and learner-facing support tools.',
    readTools: ['session.get-session'],
    writeTools: [],
    compositeTools: ['get-session-explanation-pack'],
    forbiddenTools: ['session.complete-session'],
    reviewedWriteByDefault: false,
    maxLatencyMs: 10000,
  },
};

describe('AgentWorkbench', () => {
  beforeEach(() => {
    useAgentsMock.mockReset();
    useAgentMock.mockReset();
    useAgentToolsMock.mockReset();
    useCardsMock.mockReset();
    useCurriculaMock.mockReset();
    useIngestionDocumentsMock.mockReset();
    useNextStepMock.mockReset();
    useSessionsMock.mockReset();
    preflightMutateAsyncMock.mockReset();
    runMutateAsyncMock.mockReset();
    useAgentPreflightMock.mockReset();
    useAgentRunMock.mockReset();

    useAgentsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { data: { agents: [cognitiveCopilot] } },
    });
    useAgentMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { data: cognitiveCopilot },
      error: null,
    });
    useAgentToolsMock.mockReturnValue({
      data: {
        data: {
          tools: [
            {
              name: 'get-session-explanation-pack',
              description: 'Narrative explanation pack.',
            },
          ],
        },
      },
    });
    useSessionsMock.mockReturnValue({
      data: { data: { sessions: [{ id: 'session_demo' }], total: 1 } },
    });
    useCurriculaMock.mockReturnValue({
      data: {
        data: [
          {
            id: 'curriculum_demo',
            activeVersion: {
              nodes: [
                {
                  id: 'cnode_demo',
                  stableNodeKey: 'node_frontier_1',
                  ckgConceptId: 'concept_stability',
                },
              ],
            },
          },
        ],
      },
    });
    useCardsMock.mockReturnValue({
      data: {
        data: {
          items: [
            {
              id: 'card_demo',
              anchoredCkgNodeIds: ['concept_stability'],
              anchoredPkgNodeIds: [],
              knowledgeNodeIds: [],
            },
          ],
        },
      },
    });
    useIngestionDocumentsMock.mockReturnValue({
      data: { data: [{ id: 'doc_demo' }] },
    });
    useNextStepMock.mockReturnValue({
      data: { data: { nextStep: { id: 'step_demo' } } },
    });
    useAgentPreflightMock.mockReturnValue({
      mutateAsync: preflightMutateAsyncMock,
      isPending: false,
      isError: false,
      error: null,
      data: {
        data: {
          decision: {
            allowed: false,
            riskLevel: 'medium',
            requiresReview: true,
            reviewQueue: 'watchtower',
            reviewPath: ['watchtower'],
            reasons: ['Tool belt governs the run.'],
            blockedReasons: ['Requested forbidden tools: session.complete-session'],
            allowedActions: ['session.get-session'],
            deniedActions: ['session.complete-session'],
          },
        },
      },
    });
    useAgentRunMock.mockReturnValue({
      mutateAsync: runMutateAsyncMock,
      isPending: false,
      isError: false,
      error: null,
    });
  });

  test('sends a preflight request and surfaces blocked reasons', async () => {
    render(<AgentWorkbench />);

    fireEvent.change(screen.getByLabelText(/requested tools/i), {
      target: { value: 'session.complete-session' },
    });
    fireEvent.click(screen.getByRole('button', { name: /run preflight/i }));

    await waitFor(() => {
      expect(preflightMutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user_1',
          sessionId: 'session_demo',
          requestedTools: ['session.complete-session'],
          allowFallback: true,
        })
      );
    });

    expect(screen.getByText(/requested forbidden tools/i)).toBeInTheDocument();
    expect(screen.getAllByText(/watchtower/i).length).toBeGreaterThan(0);
  });
});
