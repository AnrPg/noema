import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { StepSelfRating } from '@noema/types';
import ActiveSessionPage from './page.js';

const presentStepMock = vi.fn();
const answerStepMock = vi.fn();
const skipStepMock = vi.fn();
const refetchMock = vi.fn(() => Promise.resolve(undefined));
const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ sessionId: 'session_1' }),
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@noema/auth', () => ({
  useAuth: () => ({
    user: { id: 'user_1' },
  }),
}));

vi.mock('@/features/agents', () => ({
  AgentActionButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));

const useNextStepMock = vi.fn();

vi.mock('@noema/api-client/session', () => ({
  useNextStep: (...args: unknown[]) => useNextStepMock(...args),
  usePresentStep: () => ({
    mutateAsync: presentStepMock,
    isPending: false,
  }),
  useAnswerStep: () => ({
    mutateAsync: answerStepMock,
    isPending: false,
  }),
  useSkipStep: () => ({
    mutateAsync: skipStepMock,
    isPending: false,
  }),
}));

beforeEach(() => {
  presentStepMock.mockReset();
  answerStepMock.mockReset();
  skipStepMock.mockReset();
  refetchMock.mockClear();
  pushMock.mockReset();
  useNextStepMock.mockReset();
  useNextStepMock.mockReturnValue({
    data: {
      data: {
        session: {
          id: 'session_1',
          config: { topic: 'Cellular respiration' },
          stats: {
            stepsPlanned: 3,
            stepsPresented: 1,
            stepsEvaluated: 0,
            stepsSkipped: 0,
          },
        },
        nextStep: {
          id: 'step_1',
          objective: 'Explain why ATP yield changes with oxygen availability.',
          expectedOutcome: 'Connect oxygen availability to electron transport and ATP yield.',
          selectedMode: 'explain_your_algorithm',
          transformationType: 'explanation',
          difficulty: 0.6,
          status: 'presented',
          activities: [
            {
              prompt: 'Build a short causal chain from oxygen to ATP yield.',
            },
          ],
        },
      },
    },
    isLoading: false,
    isError: false,
    refetch: refetchMock,
  });
  answerStepMock.mockResolvedValue({ data: { id: 'step_1' } });
});

test('renders Step view with three-choice self-rating, trace, and evaluation summary', () => {
  render(<ActiveSessionPage />);

  expect(
    screen.getByRole('heading', {
      level: 2,
      name: /explain why atp yield changes/i,
    })
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /knew it/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /hesitated/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /didn't know/i })).toBeInTheDocument();
  expect(screen.getByText(/trace builder/i)).toBeInTheDocument();
  expect(screen.getByText(/evaluation summary/i)).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/step response/i), {
    target: { value: 'Oxygen keeps the electron transport chain accepting electrons.' },
  });
  fireEvent.click(screen.getByRole('button', { name: /knew it/i }));
  fireEvent.click(screen.getByLabelText(/i met the expected outcome/i));
  fireEvent.click(screen.getByRole('button', { name: /submit step/i }));

  expect(answerStepMock).toHaveBeenCalledWith(
    expect.objectContaining({
      correct: true,
      selfRating: StepSelfRating.KNEW_IT,
      trace: expect.objectContaining({
        frames: expect.objectContaining({
          f5: expect.objectContaining({ notes: `Self-rating: ${StepSelfRating.KNEW_IT}` }),
        }),
      }),
    })
  );
});

test('keeps the answered step visible while evaluation is pending', () => {
  useNextStepMock.mockReturnValue({
    data: {
      data: {
        session: {
          id: 'session_1',
          config: { topic: 'Cellular respiration' },
          stats: {
            stepsPlanned: 3,
            stepsPresented: 1,
            stepsEvaluated: 0,
            stepsSkipped: 0,
          },
        },
        nextStep: {
          id: 'step_1',
          objective: 'Explain why ATP yield changes with oxygen availability.',
          expectedOutcome: 'Connect oxygen availability to electron transport and ATP yield.',
          selectedMode: 'explain_your_algorithm',
          transformationType: 'explanation',
          difficulty: 0.6,
          status: 'answered',
          activities: [
            {
              prompt: 'Build a short causal chain from oxygen to ATP yield.',
            },
          ],
        },
      },
    },
    isLoading: false,
    isError: false,
    refetch: refetchMock,
  });

  render(<ActiveSessionPage />);

  expect(screen.getByText(/we saved your answer and we are finishing its evaluation now/i)).toBeInTheDocument();
  expect(screen.queryByText(/session complete/i)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /submit step/i })).toBeDisabled();
});
