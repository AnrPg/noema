import type { IDocumentChunkDto, IDocumentIrBlockDto, IDocumentIrDto } from '@noema/contracts';
import type { DocumentChunkId, DocumentId, UserId } from '@noema/types';
import { ID_PREFIXES } from '@noema/types';
import { nanoid } from 'nanoid';
import type { IParsedDocument } from './external-ports.js';

export function buildIr(
  documentId: DocumentId,
  title: string,
  parsed: IParsedDocument
): IDocumentIrDto {
  const outline = parsed.blocks.filter((block) => block.kind === 'heading');
  return {
    documentId,
    language: parsed.language ?? 'und',
    title,
    outline,
    blocks: parsed.blocks,
    metadata: {},
    createdAt: new Date().toISOString(),
  };
}

export function parsePlainText(title: string, text: string): IParsedDocument {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: IDocumentIrBlockDto[] = [];
  const headingPath: string[] = [];
  let buffer: string[] = [];
  let order = 0;

  const flushParagraph = (): void => {
    const paragraph = buffer.join('\n').trim();
    if (paragraph.length > 0) {
      blocks.push({
        id: `block_${String(order)}`,
        kind: 'paragraph',
        text: paragraph,
        order,
        metadata: { headingPath: [...headingPath] },
      });
      order += 1;
    }
    buffer = [];
  };

  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (heading !== null) {
      flushParagraph();
      const level = heading[1]?.length ?? 1;
      const textValue = heading[2]?.trim() ?? title;
      headingPath.splice(level - 1, headingPath.length, textValue);
      blocks.push({
        id: `block_${String(order)}`,
        kind: 'heading',
        text: textValue,
        level,
        order,
        metadata: { headingPath: [...headingPath] },
      });
      order += 1;
      continue;
    }
    if (line.trim().length === 0) {
      flushParagraph();
      continue;
    }
    buffer.push(line);
  }
  flushParagraph();

  if (blocks.length === 0) {
    blocks.push({
      id: 'block_0',
      kind: 'paragraph',
      text,
      order: 0,
      metadata: { headingPath: [] },
    });
  }

  return { rawText: text, language: 'und', blocks };
}

export function chunkIr(
  documentId: DocumentId,
  userId: UserId,
  ir: IDocumentIrDto
): IDocumentChunkDto[] {
  const chunks: IDocumentChunkDto[] = [];
  let ordinal = 0;
  for (const block of ir.blocks) {
    if (block.kind === 'heading' || block.text.trim().length === 0) continue;
    const headingPath = Array.isArray(block.metadata['headingPath'])
      ? (block.metadata['headingPath'] as string[])
      : [];
    for (const text of splitIntoChunkSizedText(block.text)) {
      chunks.push({
        id: `${ID_PREFIXES.DocumentChunkId}${nanoid(21)}` as DocumentChunkId,
        documentId,
        userId,
        ordinal,
        text,
        tokenEstimate: estimateTokenCount(text),
        headingPath,
        ...(block.pageRef !== undefined ? { pageRef: block.pageRef } : {}),
        metadata: { sourceBlockId: block.id },
        createdAt: new Date().toISOString(),
      });
      ordinal += 1;
    }
  }
  return chunks;
}

function splitIntoChunkSizedText(text: string): string[] {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  if (words.length <= 480) return [text.trim()];
  const chunks: string[] = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(words.length, start + 560);
    chunks.push(words.slice(start, end).join(' '));
    if (end === words.length) break;
    start = Math.max(end - 80, start + 1);
  }
  return chunks;
}

function estimateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.split(/\s+/).filter((word) => word.length > 0).length * 1.3));
}
