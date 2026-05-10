import { describe, expect, it } from 'vitest';
import type { DocumentId, UserId } from '@noema/types';
import { buildExtractionWindows, buildIr, chunkIr, parseDocumentContent, parsePlainText } from './pipeline.js';

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

  it('separates markdown image blocks from text before chunking', () => {
    const parsed = parseDocumentContent(
      {
        id: 'doc_123456789012345678901' as never,
        userId: 'user_123456789012345678901' as never,
        title: 'Mechanics',
        sourceKind: 'upload',
        mimeKind: 'text/markdown',
        checksum: 'checksum',
        byteLength: 42,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      '# Forces\n\n![diagram](forces.png)\n\nForce equals mass times acceleration.'
    );
    const ir = buildIr('doc_123456789012345678901' as DocumentId, 'Mechanics', parsed);
    const chunks = chunkIr(
      'doc_123456789012345678901' as DocumentId,
      'user_123456789012345678901' as UserId,
      ir
    );

    expect(ir.blocks.some((block) => block.kind === 'image')).toBe(true);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toContain('Force equals mass times acceleration.');
  });

  it('builds overlapping extraction windows from chunked text blocks', () => {
    const repeatedSentence = 'Bayes theorem updates probabilities using evidence.';
    const parsed = parsePlainText(
      'Probability',
      `# Probability\n\n${Array.from({ length: 120 }, () => repeatedSentence).join(' ')}`
    );
    const ir = buildIr('doc_123456789012345678901' as DocumentId, 'Probability', parsed);
    const chunks = chunkIr(
      'doc_123456789012345678901' as DocumentId,
      'user_123456789012345678901' as UserId,
      ir
    );
    const windows = buildExtractionWindows(ir, chunks);

    expect(windows.length).toBeGreaterThan(1);
    expect(windows[0]?.chunkIds.length).toBeGreaterThan(0);
    expect(windows[1]?.text).toContain('Bayes theorem');
  });

  it('infers typst by file extension and parses typst heading syntax', () => {
    const parsed = parseDocumentContent(
      {
        id: 'doc_123456789012345678901' as never,
        userId: 'user_123456789012345678901' as never,
        title: 'notes.typ',
        sourceKind: 'upload',
        mimeKind: 'text/plain',
        checksum: 'checksum',
        byteLength: 32,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      '= Probability\n\nBayes theorem updates beliefs.'
    );

    expect(parsed.format).toBe('typst');
    expect(parsed.metadata?.['parserMode']).toBe('typst');
    expect(parsed.blocks[0]?.kind).toBe('heading');
    expect(parsed.blocks[0]?.text).toBe('Probability');
  });
});
