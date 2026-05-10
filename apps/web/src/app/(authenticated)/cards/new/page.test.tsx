import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, test, vi } from 'vitest';
import NewCardPage from './page.js';

const {
  createCardMock,
  transitionCardStateMock,
  createNodeMock,
  batchCreateMock,
  createEdgeMock,
  updateNodeMock,
  refreshAnalyticsMock,
  deleteEdgeMock,
  pkgNodesData,
  ckgNodesData,
} = vi.hoisted(() => ({
  createCardMock: vi.fn(),
  transitionCardStateMock: vi.fn(),
  createNodeMock: vi.fn(),
  batchCreateMock: vi.fn(),
  createEdgeMock: vi.fn(),
  updateNodeMock: vi.fn(),
  refreshAnalyticsMock: vi.fn(),
  deleteEdgeMock: vi.fn(),
  pkgNodesData: [] as unknown[],
  ckgNodesData: [] as unknown[],
}));

vi.mock('@noema/auth', () => ({
  useAuth: () => ({
    user: { id: 'user_1', displayName: 'Test User', email: 'test@example.com', avatarUrl: null },
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/hooks/use-active-study-mode', () => ({
  useActiveStudyMode: () => 'knowledge_gaining',
}));

vi.mock('@noema/ui/forms', () => ({
  DomainSuggestionField: ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: string;
    onChange: (nextValue: string) => void;
  }) => (
    <label>
      <span>{label}</span>
      <input
        aria-label={label}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </label>
  ),
  FieldLabel: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@noema/api-client', () => ({
  contentKeys: {
    cards: () => ['cards'],
  },
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
}));

vi.mock('@noema/api-client/knowledge-graph', () => ({
  kgKeys: {
    pkg: () => ['kg', 'pkg'],
  },
  pkgEdgesApi: {
    delete: deleteEdgeMock,
  },
  usePKGNodes: () => ({
    data: pkgNodesData,
    isLoading: false,
  }),
  useCKGNodes: () => ({
    data: ckgNodesData,
    isLoading: false,
  }),
  usePKGEdges: () => ({
    data: [],
    isLoading: false,
  }),
  useDomainSuggestions: () => ({
    data: { resolvedDomain: 'general', needsDecision: false },
    isFetching: false,
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

function advanceToSettings(): void {
  fireEvent.click(screen.getByRole('button', { name: /atomic.*simple question/i }));
  fireEvent.change(screen.getByPlaceholderText(/enter the question or prompt/i), {
    target: { value: 'What is a group?' },
  });
  fireEvent.change(screen.getByPlaceholderText(/enter the answer/i), {
    target: { value: 'A set with an associative operation, identity, and inverses.' },
  });
  fireEvent.click(screen.getByRole('button', { name: /next: settings/i }));
}

function openManualNodeEntry(): void {
  fireEvent.click(screen.getByRole('button', { name: /show advanced manual id entry/i }));
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
  pkgNodesData.splice(0, pkgNodesData.length);
  ckgNodesData.splice(0, ckgNodesData.length);
  refreshAnalyticsMock.mockResolvedValue({
    metrics: {},
    stage: {},
  });
});

test('creates and attaches a new PKG node before payload creation', async () => {
  createNodeMock.mockResolvedValue({
    data: {
      id: 'node_abcdefghijklmnopqrstu',
      type: 'notion',
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
      version: 1,
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

  fireEvent.click(screen.getByRole('button', { name: /atomic.*simple question/i }));

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
        type: 'notion',
        domain: 'general',
        supportedStudyModes: ['knowledge_gaining'],
      })
    );
  });

  fireEvent.click(screen.getByRole('button', { name: /^create payload$/i }));

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
      data: { state: 'active', version: 1 },
    });
  });
});

test('keeps the panel stable when a new PKG-only node has no canonical metadata', async () => {
  ckgNodesData.push({
    id: 'node_ckg_microbiology',
    type: 'notion',
    label: 'Microbiology',
    description: 'Canonical suggestion that stays visible during the search pass.',
    domain: 'general',
    status: null,
    aliases: [],
    languages: [],
    tags: [],
    semanticHints: [],
    supportedStudyModes: ['knowledge_gaining'],
    canonicalExternalRefs: [],
    ontologyMappings: [],
    provenance: [],
    reviewMetadata: null,
    sourceCoverage: null,
    metadata: {},
    createdAt: '2026-03-23T00:00:00.000Z',
    updatedAt: '2026-03-23T00:00:00.000Z',
  });
  createNodeMock.mockResolvedValue({
    data: {
      id: 'node_microbiology_local',
      type: 'notion',
      label: 'Microbiology',
      description: null,
      createdAt: '2026-03-23T00:00:00.000Z',
      updatedAt: '2026-03-23T00:00:00.000Z',
    },
  });

  renderPage();

  fireEvent.click(screen.getByRole('button', { name: /atomic.*simple question/i }));
  fireEvent.change(screen.getByPlaceholderText(/enter the question or prompt/i), {
    target: { value: 'What does microbiology study?' },
  });
  fireEvent.change(screen.getByPlaceholderText(/enter the answer/i), {
    target: { value: 'Microorganisms.' },
  });
  fireEvent.click(screen.getByRole('button', { name: /next: settings/i }));

  fireEvent.change(screen.getByPlaceholderText(/search node label, type, or id/i), {
    target: { value: 'Microbiology' },
  });
  fireEvent.click(screen.getByRole('button', { name: /create and attach node/i }));

  await waitFor(() => {
    expect(createNodeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Microbiology',
        type: 'notion',
        domain: 'general',
      })
    );
  });

  await waitFor(() => {
    expect(screen.getByText(/1 attached/i)).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Microbiology' })).not.toBeNull();
  });
});

test('accepts knowledge node IDs containing underscores', async () => {
  createCardMock.mockResolvedValue({
    data: {
      id: 'card_1',
      version: 1,
      knowledgeNodeIds: ['node_xVIJQZGqM1oWwnu_vtQNP'],
    },
  });
  transitionCardStateMock.mockResolvedValue({
    data: {
      id: 'card_1',
      version: 1,
      knowledgeNodeIds: ['node_xVIJQZGqM1oWwnu_vtQNP'],
      state: 'active',
    },
  });

  renderPage();
  advanceToSettings();
  openManualNodeEntry();

  fireEvent.change(screen.getByRole('textbox', { name: /manual node ids/i }), {
    target: { value: 'node_xVIJQZGqM1oWwnu_vtQNP' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^create payload$/i }));

  await waitFor(() => {
    expect(createCardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryConceptId: 'node_xVIJQZGqM1oWwnu_vtQNP',
        knowledgeNodeIds: ['node_xVIJQZGqM1oWwnu_vtQNP'],
      })
    );
  });
});

test('accepts knowledge node IDs containing hyphens', async () => {
  createCardMock.mockResolvedValue({
    data: {
      id: 'card_1',
      version: 1,
      knowledgeNodeIds: ['node_xVIJQZGqM1oWwnu-vtQNP'],
    },
  });
  transitionCardStateMock.mockResolvedValue({
    data: {
      id: 'card_1',
      version: 1,
      knowledgeNodeIds: ['node_xVIJQZGqM1oWwnu-vtQNP'],
      state: 'active',
    },
  });

  renderPage();
  advanceToSettings();
  openManualNodeEntry();

  fireEvent.change(screen.getByRole('textbox', { name: /manual node ids/i }), {
    target: { value: 'node_xVIJQZGqM1oWwnu-vtQNP' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^create payload$/i }));

  await waitFor(() => {
    expect(createCardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryConceptId: 'node_xVIJQZGqM1oWwnu-vtQNP',
        knowledgeNodeIds: ['node_xVIJQZGqM1oWwnu-vtQNP'],
      })
    );
  });
});

test('rejects invalid knowledge node IDs that do not match the shared NodeId format', async () => {
  renderPage();
  advanceToSettings();
  openManualNodeEntry();

  fireEvent.change(screen.getByRole('textbox', { name: /manual node ids/i }), {
    target: { value: 'node_invalid!' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^create payload$/i }));

  await waitFor(() => {
    expect(
      screen.getByText(
        /invalid knowledge node id: node_invalid!.*21 url-safe nanoid characters/i
      )
    ).not.toBeNull();
  });
  expect(createCardMock).not.toHaveBeenCalled();
});
