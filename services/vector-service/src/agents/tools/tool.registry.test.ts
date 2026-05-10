import { describe, expect, it } from 'vitest';
import { createToolRegistry } from './tool.registry.js';

describe('retrieve-document-chunks tool', () => {
  it('rejects document-only retrieval without semantic query input', async () => {
    const registry = createToolRegistry({
      search: async () => [],
    } as never);

    const result = await registry.execute('retrieve-document-chunks', { documentId: 'doc_1' }, 'user_1');

    expect(result.success).toBe(false);
    expect(result.error).toEqual({
      code: 'INVALID_INPUT',
      message: 'Provide a semantic query or conceptLabels for retrieval; documentId alone is insufficient.',
    });
  });

  it('retrieves per concept label and deduplicates returned chunks', async () => {
    const queries: string[] = [];
    const registry = createToolRegistry({
      search: async ({ query }: { query: string }) => {
        queries.push(query);
        return [
          { chunkId: 'chunk_1', text: `${query} chunk`, score: 0.9 },
          { chunkId: 'chunk_1', text: `${query} chunk`, score: 0.9 },
        ];
      },
    } as never);

    const result = await registry.execute(
      'retrieve-document-chunks',
      { documentId: 'doc_1', conceptLabels: ['Bayes theorem', 'Conditional probability'], limit: 4 },
      'user_1'
    );

    expect(result.success).toBe(true);
    expect(queries).toEqual(['Bayes theorem', 'Conditional probability']);
    expect(result.data).toMatchObject({
      documentId: 'doc_1',
      queryPlan: {
        mode: 'per_concept_label',
        queries: ['Bayes theorem', 'Conditional probability'],
      },
      matches: [
        { query: 'Bayes theorem', conceptLabel: 'Bayes theorem' },
        { query: 'Conditional probability', conceptLabel: 'Conditional probability' },
      ],
    });
    expect((result.data as { chunks: Array<{ chunkId: string; text: string; score: number }> }).chunks).toEqual([
      { chunkId: 'chunk_1', text: 'Bayes theorem chunk', score: 0.9 },
    ]);
  });
});
