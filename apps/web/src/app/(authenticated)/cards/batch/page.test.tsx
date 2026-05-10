import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, test, vi } from 'vitest';
import BatchOperationsPage from './page.js';

const {
  previewImportMock,
  executeImportMock,
  createNodeMock,
  createEdgeMock,
  updateNodeMock,
  refreshAnalyticsMock,
  deleteEdgeMock,
} = vi.hoisted(() => ({
  previewImportMock: vi.fn(),
  executeImportMock: vi.fn(),
  createNodeMock: vi.fn(),
  createEdgeMock: vi.fn(),
  updateNodeMock: vi.fn(),
  refreshAnalyticsMock: vi.fn(),
  deleteEdgeMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock('@noema/auth', () => ({
  useAuth: () => ({
    user: { id: 'user_1', displayName: 'Test User', email: 'test@example.com', avatarUrl: null },
  }),
}));

vi.mock('@/hooks/use-active-study-mode', () => ({
  useActiveStudyMode: () => 'knowledge_gaining',
}));

vi.mock('@/lib/study-mode', () => ({
  getStudyModeLabel: () => 'Knowledge gaining',
  getStudyModeDescription: () => 'Concept-first mode.',
}));

vi.mock('@/lib/api-errors', () => ({
  formatApiErrorMessage: (_error: unknown, options: { fallback: string }) => options.fallback,
}));

vi.mock('@/lib/cards/batch-import', () => ({
  BATCH_IMPORT_ACCEPT: '.csv',
  BATCH_IMPORT_FILE_TYPES: [
    {
      id: 'csv',
      label: 'CSV',
      extensions: '.csv',
      description: 'Comma-separated values',
      insight: 'Useful for lightweight imports.',
      formats: [
        {
          id: 'csv-front-back',
          label: 'Front / Back CSV',
          description: 'Two columns for front and back.',
          insight: 'Use this when each row is already payload-shaped.',
        },
      ],
    },
  ],
  getBatchImportFileTypeDefinition: () => ({
    id: 'csv',
    label: 'CSV',
    extensions: '.csv',
    description: 'Comma-separated values',
    insight: 'Useful for lightweight imports.',
    formats: [
      {
        id: 'csv-front-back',
        label: 'Front / Back CSV',
        description: 'Two columns for front and back.',
        insight: 'Use this when each row is already payload-shaped.',
      },
    ],
  }),
}));

vi.mock('@noema/api-client', () => ({
  contentKeys: {
    cards: () => ['cards'],
    recentBatches: () => ['recent-batches'],
  },
  kgKeys: {
    pkg: () => ['kg', 'pkg'],
  },
  pkgEdgesApi: {
    delete: deleteEdgeMock,
  },
  usePreviewCardImport: () => ({
    mutateAsync: previewImportMock,
    isPending: false,
    reset: vi.fn(),
  }),
  useExecuteCardImport: (options?: { onSuccess?: (response: unknown) => void }) => ({
    mutateAsync: (input: unknown) => {
      executeImportMock(input);
      const response = {
        data: {
          batchId: 'batch_1',
          created: [],
          failed: [],
          total: 2,
          importWarnings: [],
        },
      };
      options?.onSuccess?.(response);
      return response;
    },
    isPending: false,
    reset: vi.fn(),
  }),
  useRecentBatches: () => ({
    data: { data: [] },
    isLoading: false,
    isError: false,
    error: null,
  }),
  useRollbackBatch: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useBatch: () => ({
    data: { data: [] },
    isLoading: false,
    isError: false,
  }),
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
  useCreatePKGNode: () => ({
    mutateAsync: createNodeMock,
    isPending: false,
    error: null,
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

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BatchOperationsPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  previewImportMock.mockReset();
  executeImportMock.mockReset();
  createNodeMock.mockReset();
  createEdgeMock.mockReset();
  updateNodeMock.mockReset();
  refreshAnalyticsMock.mockReset();
  deleteEdgeMock.mockReset();
  refreshAnalyticsMock.mockResolvedValue({
    metrics: {},
    stage: {},
  });

  previewImportMock.mockResolvedValue({
    data: {
      fileName: 'cards.csv',
      fileType: 'csv',
      formatId: 'csv-front-back',
      sourceFields: [
        { key: 'Front', sample: 'Q1' },
        { key: 'Back', sample: 'A1' },
      ],
      records: [{ values: { Front: 'Q1', Back: 'A1' } }, { values: { Front: 'Q2', Back: 'A2' } }],
      warnings: [],
      suggestedMappings: [
        { sourceKey: 'Front', targetFieldId: 'front' },
        { sourceKey: 'Back', targetFieldId: 'back' },
      ],
    },
  });
});

test('batch metadata step carries values forward payload by payload', async () => {
  createNodeMock.mockResolvedValue({
    data: {
      id: 'node_abcdefghijklmnopqrstu',
      type: 'notion',
      label: 'Biology foundations',
      description: null,
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
    },
  });

  const { container } = renderPage();

  fireEvent.click(screen.getByRole('button', { name: /csv .*\.csv/i }));
  fireEvent.click(screen.getByRole('button', { name: /front \/ back csv.*two columns/i }));

  const fileInput = container.querySelector('input[type="file"]');
  expect(fileInput).not.toBeNull();

  const file = new File(['Front,Back\nQ1,A1\nQ2,A2'], 'cards.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', {
    value: () => Promise.resolve('Front,Back\nQ1,A1\nQ2,A2'),
    configurable: true,
  });
  Object.defineProperty(fileInput, 'files', {
    value: [file],
    configurable: true,
  });
  fireEvent.change(fileInput as HTMLInputElement);

  await waitFor(() => {
    expect(previewImportMock).toHaveBeenCalled();
  });

  await waitFor(() => {
    expect(screen.getByText(/preview ready/i)).not.toBeNull();
  });

  fireEvent.click(screen.getByRole('button', { name: /next: payload metadata/i }));

  await waitFor(() => {
    expect(screen.getByText(/payload 1 of 2/i)).not.toBeNull();
    expect(screen.getByText(/^q1$/i)).not.toBeNull();
    expect(screen.getByText(/^a1$/i)).not.toBeNull();
  });

  fireEvent.change(screen.getByLabelText(/^tags$/i), {
    target: { value: 'biology, imported' },
  });
  fireEvent.change(screen.getByPlaceholderText(/search node label, type, or id/i), {
    target: { value: 'Biology foundations' },
  });
  fireEvent.click(screen.getByRole('button', { name: /create and attach node/i }));

  await waitFor(() => {
    expect(createNodeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Biology foundations',
        type: 'notion',
        domain: 'general',
        supportedStudyModes: ['knowledge_gaining'],
      })
    );
  });

  fireEvent.change(screen.getByLabelText(/^difficulty$/i), {
    target: { value: 'advanced' },
  });
  fireEvent.change(screen.getByLabelText(/initial state/i), {
    target: { value: 'active' },
  });

  fireEvent.click(screen.getByRole('button', { name: /next payload/i }));

  await waitFor(() => {
    expect(screen.getByText(/payload 2 of 2/i)).not.toBeNull();
    expect(screen.getByText(/^q2$/i)).not.toBeNull();
    expect(screen.getByText(/^a2$/i)).not.toBeNull();
  });

  expect(screen.getByLabelText(/^tags$/i)).toHaveValue('biology, imported');
  expect(screen.getAllByText(/biology foundations/i).length).toBeGreaterThan(0);
  expect(screen.getByLabelText(/^difficulty$/i)).toHaveValue('advanced');
  expect(screen.getByLabelText(/initial state/i)).toHaveValue('active');

  fireEvent.click(screen.getByRole('button', { name: /import payloads/i }));

  await waitFor(() => {
    expect(executeImportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recordMetadata: [
          {
            index: 0,
            tags: ['biology', 'imported'],
            knowledgeNodeIds: ['node_abcdefghijklmnopqrstu'],
            difficulty: 'advanced',
            state: 'active',
          },
          {
            index: 1,
            tags: ['biology', 'imported'],
            knowledgeNodeIds: ['node_abcdefghijklmnopqrstu'],
            difficulty: 'advanced',
            state: 'active',
          },
        ],
      })
    );
  });
});
