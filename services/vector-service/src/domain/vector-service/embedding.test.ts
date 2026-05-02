import { describe, expect, it } from 'vitest';
import { HashEmbeddingModel, cosineSimilarity } from './embedding.js';

describe('HashEmbeddingModel', () => {
  it('creates deterministic normalized embeddings', () => {
    const model = new HashEmbeddingModel(32);

    const first = model.embed('concept mapping from documents');
    const second = model.embed('concept mapping from documents');

    expect(first).toEqual(second);
    expect(first).toHaveLength(32);
    expect(cosineSimilarity(first, second)).toBeCloseTo(1, 5);
  });
});
