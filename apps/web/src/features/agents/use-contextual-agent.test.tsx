import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useContextualAgent } from './use-contextual-agent';

const agentsApiMock = vi.hoisted(() => ({
  cancelBatchJob: vi.fn(),
  getAgent: vi.fn(),
  getBatchJob: vi.fn(),
  preflightAgent: vi.fn(),
  runAgent: vi.fn(),
  runAgentAsync: vi.fn(),
}));

vi.mock('@noema/api-client/agents', () => ({
  agentsApi: agentsApiMock,
}));

vi.mock('@noema/auth', () => ({
  useAuth: () => ({
    user: { id: 'user_123' },
  }),
}));

function Harness(props: { context?: { sessionId?: string; requestTimeoutMs?: number } }): React.JSX.Element {
  const agent = useContextualAgent({
    agentName: 'lesson-plan-generator',
    context: props.context,
  });

  return (
    <button
      type="button"
      disabled={!agent.canRun || agent.isRunning}
      onClick={() => {
        void agent.run();
      }}
    >
      Run
    </button>
  );
}

function renderHarness(context?: { sessionId?: string; requestTimeoutMs?: number }): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <Harness context={context} />
    </QueryClientProvider>
  );
}

describe('useContextualAgent', () => {
  beforeEach(() => {
    agentsApiMock.cancelBatchJob.mockReset();
    agentsApiMock.getAgent.mockReset();
    agentsApiMock.getBatchJob.mockReset();
    agentsApiMock.preflightAgent.mockReset();
    agentsApiMock.runAgent.mockReset();
    agentsApiMock.runAgentAsync.mockReset();

    agentsApiMock.runAgent.mockResolvedValue({
      data: {
        agent: {
          name: 'lesson-plan-generator',
          family: 'planner',
          purpose: 'Prepare lesson plans.',
          executionMode: 'lesson_plan',
          toolBeltId: 'tool-belt',
          primaryCompositeTool: null,
          outputKind: 'proposal',
          writeAuthority: 'reviewed',
          reviewPath: ['/session/new'],
          instructions: [],
          requiredFields: ['userId', 'sessionId'],
          toolBelt: {
            id: 'tool-belt',
            description: 'Test tool belt',
            readTools: [],
            writeTools: [],
            compositeTools: [],
            forbiddenTools: [],
            reviewedWriteByDefault: true,
            maxLatencyMs: 90_000,
          },
        },
        contextPack: {},
        execution: null,
        preflight: {
          allowed: true,
          riskLevel: 'medium',
          requiresReview: true,
          reviewQueue: 'session-review',
          reviewPath: ['/session/new'],
          reasons: [],
          blockedReasons: [],
          allowedActions: ['review'],
          deniedActions: [],
        },
        prompt: null,
        request: {
          userId: 'user_123',
          sessionId: 'session_123',
        },
        runId: 'run_1',
        status: 'completed',
      },
    });
  });

  it('uses the agent wrapper latency budget as the realtime request timeout', async () => {
    agentsApiMock.getAgent.mockResolvedValue({
      data: {
        maxLatencySeconds: 90,
      },
    });

    renderHarness({ sessionId: 'session_123' });

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(agentsApiMock.runAgent).toHaveBeenCalledWith(
        'lesson-plan-generator',
        expect.objectContaining({
          userId: 'user_123',
          sessionId: 'session_123',
          requestTimeoutMs: 90_000,
        })
      );
    });
  });

  it('preserves an explicit timeout from the caller without fetching agent details', async () => {
    renderHarness({ sessionId: 'session_123', requestTimeoutMs: 45_000 });

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(agentsApiMock.runAgent).toHaveBeenCalledWith(
        'lesson-plan-generator',
        expect.objectContaining({
          userId: 'user_123',
          sessionId: 'session_123',
          requestTimeoutMs: 45_000,
        })
      );
    });

    expect(agentsApiMock.getAgent).not.toHaveBeenCalled();
  });

  it('does not enqueue another request while a batch job is already active', async () => {
    agentsApiMock.runAgentAsync.mockImplementation(
      () => new Promise(() => undefined)
    );

    function BatchHarness(): React.JSX.Element {
      const agent = useContextualAgent({
        agentName: 'curriculum-planner',
        context: {
          conceptIds: ['concept_1'],
          requestTimeoutMs: 45_000,
        },
        executionPreference: 'batch',
      });

      return (
        <button
          type="button"
          disabled={!agent.canRun || agent.isRunning}
          onClick={() => {
            void agent.run();
            void agent.run();
          }}
        >
          Run batch
        </button>
      );
    }

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <BatchHarness />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Run batch' }));

    await waitFor(() => {
      expect(agentsApiMock.runAgentAsync).toHaveBeenCalledTimes(1);
    });
  });
});
