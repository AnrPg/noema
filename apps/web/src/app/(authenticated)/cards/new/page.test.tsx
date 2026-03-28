import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, test, vi } from 'vitest';
import NewCardPage from './page.js';

const createCardMock = vi.fn();
const transitionCardStateMock = vi.fn();
const createNodeMock = vi.fn();
const batchCreateMock = vi.fn();
const createEdgeMock = vi.fn();
const updateNodeMock = vi.fn();
const refreshAnalyticsMock = vi.fn();
const deleteEdgeMock = vi.fn();

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
  kgKeys: {
    pkg: () => ['kg', 'pkg'],
  },
  pkgEdgesApi: {
    delete: deleteEdgeMock,
  },
  usePKGNodes: () => ({
    data: [],
    isLoading: false,
  }),
  useCKGNodes: () => ({
    data: [],
    isLoading: false,
  }),
  usePKGEdges: () => ({
    data: [],
    isLoading: false,
  }),
  useCreateCard: () => ({
    mutateAsync: createCardMock,
    isPending: false,
    reset: vi.fn(),
  }),
  useCardStateTransition: () => ({
    mutateAsync: transitionCardStateMock,
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
    error: null,
    reset: vi.fn(),
  }),
  useUpdatePKGNode: () => ({
    mutateAsync: updateNodeMock,
    isPending: false,
    error: null,
  }),
  useCreatePKGEdge: () => ({
    mutateAsync: createEdgeMock,
    isPending: false,
  }),
  useRefreshKnowledgeGraphAnalytics: () => ({
    mutateAsync: refreshAnalyticsMock,
    isPending: false,
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
  transitionCardStateMock.mockReset();
  createNodeMock.mockReset();
  batchCreateMock.mockReset();
  createEdgeMock.mockReset();
  updateNodeMock.mockReset();
  refreshAnalyticsMock.mockReset();
  deleteEdgeMock.mockReset();
  refreshAnalyticsMock.mockResolvedValue({
    metrics: {},
    stage: {},
  });
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
  transitionCardStateMock.mockResolvedValue({
    data: {
      id: 'card_1',
      knowledgeNodeIds: ['node_abcdefghijklmnopqrstu'],
      state: 'active',
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
    expect(createNodeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Abstract algebra',
        type: 'concept',
        domain: 'general',
        supportedStudyModes: ['knowledge_gaining'],
      })
    );
  });

  fireEvent.click(screen.getByRole('button', { name: /^create card$/i }));

  await waitFor(() => {
    expect(createCardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cardType: 'atomic',
        metadata: { state: 'active' },
        knowledgeNodeIds: ['node_abcdefghijklmnopqrstu'],
      })
    );
  });

  await waitFor(() => {
    expect(transitionCardStateMock).toHaveBeenCalledWith({
      id: 'card_1',
      data: { state: 'active' },
    });
  });
});
