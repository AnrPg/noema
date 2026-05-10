import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PythonBackedDocumentParser } from './python-document-extractor.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('PythonBackedDocumentParser', () => {
  it('routes binary payloads through the external extractor and preserves warnings', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'ingestion-parser-'));
    tempDirs.push(tempDir);
    const scriptPath = join(tempDir, 'extractor.mjs');
    await writeFile(
      scriptPath,
      `let body='';process.stdin.on('data',c=>body+=c);process.stdin.on('end',()=>{const input=JSON.parse(body);process.stdout.write(JSON.stringify({text:'# Extracted\\n\\nBinary payload parsed.',parseMode:'markdown',sourceFormat:input.sourceFormat ?? 'pdf',warnings:[{code:'EXTRACTED_BY_TEST',message:'parser bridge used'}],metadata:{contentEncoding:input.encoding,mimeKind:input.mimeKind}}));});`
    );

    const parser = new PythonBackedDocumentParser({
      pythonExecutable: process.execPath,
      scriptPath,
      timeoutMs: 5_000,
    });

    const parsed = await parser.parse(
      {
        id: 'doc_123456789012345678901' as never,
        userId: 'user_123456789012345678901' as never,
        title: 'Source.pdf',
        sourceKind: 'upload',
        mimeKind: 'application/pdf',
        checksum: 'checksum',
        byteLength: 8,
        metadata: { contentEncoding: 'base64', documentFormat: 'pdf' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      Buffer.from('fake pdf').toString('base64')
    );

    expect(parsed.format).toBe('pdf');
    expect(parsed.metadata?.['parserMode']).toBe('markdown');
    expect(parsed.metadata?.['contentEncoding']).toBe('base64');
    expect(parsed.parseWarnings).toEqual([
      { code: 'EXTRACTED_BY_TEST', message: 'parser bridge used' },
    ]);
    expect(parsed.blocks.some((block) => block.kind === 'heading')).toBe(true);
  });
});
