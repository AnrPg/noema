import { describe, expect, it } from 'vitest';
import type { DocumentId, UserId } from '@noema/types';
import { buildIr, chunkIr, parsePlainText } from './pipeline.js';

describe('ingestion pipeline', () => {
  it('parses markdown headings and chunks paragraph blocks', () => {
    const parsed = parsePlainText('Algebra Notes', '# Algebra\n\nGroups preserve structure.');
    const ir = buildIr('doc_123456789012345678901' as DocumentId, 'Algebra Notes', parsed);
    const chunks = chunkIr(
      'doc_123456789012345678901' as DocumentId,
      'user_123456789012345678901' as UserId,
      ir
    );

    expect(ir.outline[0]?.text).toBe('Algebra');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toBe('Groups preserve structure.');
    expect(chunks[0]?.headingPath).toEqual(['Algebra']);
  });
});
