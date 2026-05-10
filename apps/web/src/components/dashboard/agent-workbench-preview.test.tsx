import React from 'react';
import { render, screen } from '@testing-library/react';
import { AgentWorkbenchPreview } from './agent-workbench-preview.js';

const useAgentsMock = vi.fn();

vi.mock('@noema/api-client/agents', () => ({
  useAgents: () => useAgentsMock(),
}));

describe('AgentWorkbenchPreview', () => {
  beforeEach(() => {
    useAgentsMock.mockReset();
  });

  test('renders wrapper counts and review-aware inventory', () => {
    useAgentsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        data: {
          agents: [
            {
              name: 'cognitive-copilot',
              purpose: 'Explain the current learning state.',
              executionMode: 'preview',
              toolBelt: { reviewedWriteByDefault: false },
            },
            {
              name: 'lesson-plan-generator',
              purpose: 'Assemble a lesson plan.',
              executionMode: 'lesson_plan',
              toolBelt: { reviewedWriteByDefault: true },
            },
          ],
        },
      },
    });

    render(<AgentWorkbenchPreview />);

    expect(screen.getByText('Agent Workbench')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/cognitive-copilot/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open workbench/i })).toHaveAttribute(
      'href',
      '/agents'
    );
  });
});
