import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, test, vi } from 'vitest';
import CardDetailPage from './page.js';

const { pushMock, useCardMock, usePKGNodeMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  useCardMock: vi.fn(),
  usePKGNodeMock: vi.fn(),
}));

vi.mock('@noema/auth', () => ({
  useAuth: () => ({
    user: { id: 'user_1', displayName: 'Test User', email: 'test@example.com', avatarUrl: null },
  }),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'card_test_1' }),
  useRouter: () => ({ push: pushMock, back: vi.fn() }),
}));

vi.mock('@noema/api-client', () => ({
  contentKeys: {
    cards: () => ['cards'],
  },
  useCard: useCardMock,
  usePKGNode: usePKGNodeMock,
  useUpdateCard: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useDeleteCard: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useCardStateTransition: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/components/card-renderers', () => ({
  CardRenderer: () => <div>Card renderer</div>,
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
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
      <CardDetailPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  pushMock.mockReset();
  useCardMock.mockReset();
  usePKGNodeMock.mockReset();

  useCardMock.mockReturnValue({
    data: {
      id: 'card_test_1',
      cardType: 'atomic',
      state: 'active',
      difficulty: 'intermediate',
      version: 2,
      createdAt: '2026-05-09T20:52:00.000Z',
      updatedAt: '2026-05-09T20:52:00.000Z',
      tags: [],
      knowledgeNodeIds: ['node_pWpVUuSEBh8A86BRv2qws'],
      content: {
        front: 'Question',
        back: 'Answer',
      },
    },
    isLoading: false,
    isError: false,
    error: null,
  });
});

test('renders knowledge nodes with human-readable labels', () => {
  usePKGNodeMock.mockReturnValue({
    data: {
      id: 'node_pWpVUuSEBh8A86BRv2qws',
      label: 'SDFSD',
    },
  });

  renderPage();

  const nodeLink = screen.getByRole('link', { name: 'SDFSD' });
  expect(nodeLink).toHaveAttribute('href', '/knowledge?nodeId=node_pWpVUuSEBh8A86BRv2qws');
  expect(screen.queryByText('node_pWpVUuSEBh8A86BRv2qws')).toBeNull();
});
