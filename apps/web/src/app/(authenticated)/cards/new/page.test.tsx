import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NewCardPage from './page.js';

const createCardMock = vi.fn();
const createNodeMock = vi.fn();
const batchCreateMock = vi.fn();

vi.mock('@noema/auth', () => ({
  useAuth: () => ({
    user: { id: 'user_1', displayName: 'Test User', email: 'test@example.com', avatarUrl: null },
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock('@noema/api-client', () => ({
  contentKeys: {
    cards: () => ['cards'],
  },
  usePKGNodes: () => ({
    data: [],
    isLoading: false,
  }),
  useCreateCard: () => ({
    mutateAsync: createCardMock,
    isPending: false,
    reset: vi.fn(),
  }),
  useBatchCreateCards: () => ({
    mutateAsync: batchCreateMock,
    isPending: false,
    reset: vi.fn(),
  }),
  useCreatePKGNode: () => ({
    mutateAsync: createNodeMock,
    isPending: false,
    reset: vi.fn(),
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
      <NewCardPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  createCardMock.mockReset();
  createNodeMock.mockReset();
  batchCreateMock.mockReset();
});

test('creates and attaches a new PKG node before card creation', async () => {
  createNodeMock.mockResolvedValue({
    data: {
      id: 'node_abcdefghijklmnopqrstu',
      type: 'concept',
      label: 'Abstract algebra',
      description: null,
      tags: [],
      metadata: {},
      createdAt: '2026-03-23T00:00:00.000Z',
      updatedAt: '2026-03-23T00:00:00.000Z',
    },
  });
  createCardMock.mockResolvedValue({
    data: {
      id: 'card_1',
      knowledgeNodeIds: ['node_abcdefghijklmnopqrstu'],
    },
  });

  renderPage();

  fireEvent.click(screen.getByRole('button', { name: /^atomic$/i }));

  fireEvent.change(screen.getByPlaceholderText(/enter the question or prompt/i), {
    target: { value: 'What is a group?' },
  });
  fireEvent.change(screen.getByPlaceholderText(/enter the answer/i), {
    target: { value: 'A set with an associative operation, identity, and inverses.' },
  });
  fireEvent.click(screen.getByRole('button', { name: /next: settings/i }));

  fireEvent.change(screen.getByPlaceholderText(/search node label, type, or id/i), {
    target: { value: 'Abstract algebra' },
  });

  fireEvent.click(screen.getByRole('button', { name: /create and attach node/i }));

  await waitFor(() => {
    expect(createNodeMock).toHaveBeenCalledWith({
      label: 'Abstract algebra',
      type: 'concept',
    });
  });

  fireEvent.click(screen.getByRole('button', { name: /^create card$/i }));

  await waitFor(() => {
    expect(createCardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cardType: 'atomic',
        knowledgeNodeIds: ['node_abcdefghijklmnopqrstu'],
      })
    );
  });
});
