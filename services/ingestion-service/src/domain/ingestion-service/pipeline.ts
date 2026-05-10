import type {
  IDocumentChunkDto,
  IDocumentDto,
  IDocumentIrBlockDto,
  IDocumentIrDto,
} from '@noema/contracts';
import type { DocumentChunkId, DocumentId, UserId } from '@noema/types';
import { ID_PREFIXES } from '@noema/types';
import { nanoid } from 'nanoid';
import type { IExtractionScanWindow, IParsedDocument } from './external-ports.js';

const TEXT_BLOCK_KINDS = new Set<IDocumentIrBlockDto['kind']>([
  'paragraph',
  'list_item',
  'code',
  'quote',
  'table',
]);

export type DocumentFormat =
  | 'plain_text'
  | 'txt'
  | 'markdown'
  | 'html'
  | 'csv'
  | 'tsv'
  | 'json'
  | 'yaml'
  | 'latex'
  | 'typst'
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'epub';

export function buildIr(
  documentId: DocumentId,
  title: string,
  parsed: IParsedDocument
): IDocumentIrDto {
  const outline = parsed.blocks.filter((block) => block.kind === 'heading');
  const textBlocks = parsed.blocks.filter((block) => TEXT_BLOCK_KINDS.has(block.kind));
  const mediaBlocks = parsed.blocks.filter((block) => block.kind === 'image');
  return {
    documentId,
    language: parsed.language ?? 'und',
    title,
    outline,
    blocks: parsed.blocks,
    metadata: {
      schemaVersion: 'v2',
      format: parsed.format ?? 'plain_text',
      ...(parsed.metadata ?? {}),
      parseWarnings: parsed.parseWarnings ?? [],
      textBlockCount: textBlocks.length,
      mediaBlockCount: mediaBlocks.length,
    },
    createdAt: new Date().toISOString(),
  };
}

export function parseDocumentContent(
  document: IDocumentDto,
  content: string,
  options: {
    parseMode?: DocumentFormat | undefined;
    sourceFormat?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
  } = {}
): IParsedDocument {
  const sourceFormat = options.sourceFormat ?? resolveDocumentFormat(document);
  const parseMode =
    options.parseMode ??
    (isDocumentFormat(sourceFormat) ? sourceFormat : resolveDocumentFormat(document));
  const parsed = parseByFormat(document.title, content, parseMode);
  return {
    ...parsed,
    format: sourceFormat,
    metadata: {
      ...(options.metadata ?? {}),
      parserMode: parseMode,
    },
    rawText: buildRawText(parsed.blocks),
  };
}

export function parsePlainText(title: string, text: string): IParsedDocument {
  return parseMarkdownLike(title, text, 'plain_text');
}

export function chunkIr(
  documentId: DocumentId,
  userId: UserId,
  ir: IDocumentIrDto
): IDocumentChunkDto[] {
  const chunks: IDocumentChunkDto[] = [];
  let ordinal = 0;
  for (const block of ir.blocks) {
    if (!TEXT_BLOCK_KINDS.has(block.kind) || block.text.trim().length === 0) continue;
    const headingPath = readHeadingPath(block);
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
        metadata: {
          sourceBlockId: block.id,
          blockKind: block.kind,
        },
        createdAt: new Date().toISOString(),
      });
      ordinal += 1;
    }
  }
  return chunks;
}

export function buildExtractionWindows(
  ir: IDocumentIrDto,
  chunks: IDocumentChunkDto[]
): IExtractionScanWindow[] {
  const chunkIdsByBlock = new Map<string, DocumentChunkId[]>();
  for (const chunk of chunks) {
    const sourceBlockId = chunk.metadata['sourceBlockId'];
    if (typeof sourceBlockId !== 'string' || sourceBlockId.length === 0) continue;
    const existing = chunkIdsByBlock.get(sourceBlockId) ?? [];
    existing.push(chunk.id);
    chunkIdsByBlock.set(sourceBlockId, existing);
  }

  const units = ir.blocks
    .filter((block) => TEXT_BLOCK_KINDS.has(block.kind) && block.text.trim().length > 0)
    .flatMap((block) =>
      splitIntoChunkSizedText(block.text).map((text) => ({
        blockId: block.id,
        headingPath: readHeadingPath(block),
        text: text.trim(),
        wordCount: countWords(text),
        chunkIds: chunkIdsByBlock.get(block.id) ?? [],
        kind: block.kind,
      }))
    );

  if (units.length === 0) return [];

  const windows: IExtractionScanWindow[] = [];
  const targetWords = 420;
  const maxWords = 620;
  const overlapWords = 120;
  let start = 0;
  let ordinal = 0;

  while (start < units.length) {
    let wordCount = 0;
    let end = start;
    const windowUnits: typeof units = [];

    while (end < units.length) {
      const unit = units[end];
      if (unit === undefined) break;
      if (windowUnits.length > 0 && wordCount >= targetWords && wordCount + unit.wordCount > maxWords) {
        break;
      }
      windowUnits.push(unit);
      wordCount += unit.wordCount;
      end += 1;
      if (wordCount >= maxWords) break;
    }

    const headingPath = longestHeadingPath(windowUnits);
    const text = windowUnits
      .map((unit) => renderWindowUnit(unit.headingPath, unit.kind, unit.text))
      .join('\n\n')
      .trim();
    const blockIds = windowUnits.map((unit) => unit.blockId);
    const chunkIds = [...new Set(windowUnits.flatMap((unit) => unit.chunkIds))];

    windows.push({
      windowId: `window_${String(ordinal)}`,
      ordinal,
      text,
      tokenEstimate: estimateTokenCount(text),
      headingPath,
      blockIds,
      chunkIds,
      metadata: {
        blockCount: windowUnits.length,
        overlapWords,
      },
    });
    ordinal += 1;

    if (end >= units.length) break;

    let rewindWords = 0;
    let nextStart = end;
    while (nextStart > start && rewindWords < overlapWords) {
      nextStart -= 1;
      rewindWords += units[nextStart]?.wordCount ?? 0;
    }
    start = Math.max(nextStart, start + 1);
  }

  return windows;
}

function parseByFormat(title: string, content: string, format: DocumentFormat): IParsedDocument {
  switch (format) {
    case 'markdown':
    case 'typst':
    case 'latex':
    case 'plain_text':
    case 'txt':
    case 'pdf':
    case 'docx':
    case 'epub':
      return parseMarkdownLike(title, content, format);
    case 'html':
      return parseMarkdownLike(title, htmlToMarkdownLike(content), format);
    case 'csv':
      return parseDelimitedTable(title, content, ',', format);
    case 'tsv':
    case 'xlsx':
      return parseDelimitedTable(title, content, '\t', format);
    case 'json':
      return parseStructuredData(title, content, format);
    case 'yaml':
      return parseYamlLike(title, content, format);
    default:
      return parseMarkdownLike(title, content, 'plain_text');
  }
}

function parseMarkdownLike(title: string, text: string, format: DocumentFormat): IParsedDocument {
  const lines = normalizeNewlines(text).split('\n');
  const blocks: IDocumentIrBlockDto[] = [];
  const warnings: { code: string; message: string }[] = [];
  const headingPath: string[] = [];
  let buffer: string[] = [];
  let tableBuffer: string[] = [];
  let codeBuffer: string[] = [];
  let inCodeFence = false;
  let order = 0;

  const flushParagraph = (): void => {
    const paragraph = buffer.join('\n').trim();
    if (paragraph.length === 0) {
      buffer = [];
      return;
    }
    blocks.push({
      id: `block_${String(order)}`,
      kind: 'paragraph',
      text: paragraph,
      order,
      metadata: { headingPath: [...headingPath] },
    });
    order += 1;
    buffer = [];
  };

  const flushTable = (): void => {
    const tableText = tableBuffer.join('\n').trim();
    if (tableText.length === 0) {
      tableBuffer = [];
      return;
    }
    blocks.push({
      id: `block_${String(order)}`,
      kind: 'table',
      text: tableText,
      order,
      metadata: { headingPath: [...headingPath] },
    });
    order += 1;
    tableBuffer = [];
  };

  const flushCode = (): void => {
    const codeText = codeBuffer.join('\n').trim();
    if (codeText.length === 0) {
      codeBuffer = [];
      return;
    }
    blocks.push({
      id: `block_${String(order)}`,
      kind: 'code',
      text: codeText,
      order,
      metadata: { headingPath: [...headingPath] },
    });
    order += 1;
    codeBuffer = [];
  };

  const flushAllTextBuffers = (): void => {
    flushParagraph();
    flushTable();
    flushCode();
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.startsWith('```')) {
      flushParagraph();
      flushTable();
      if (inCodeFence) {
        flushCode();
        inCodeFence = false;
      } else {
        inCodeFence = true;
      }
      continue;
    }

    if (inCodeFence) {
      codeBuffer.push(rawLine);
      continue;
    }

    const imageMatch = /!\[([^\]]*)\]\(([^)]+)\)/.exec(line.trim());
    if (imageMatch !== null) {
      flushAllTextBuffers();
      blocks.push({
        id: `block_${String(order)}`,
        kind: 'image',
        text: (imageMatch[1] ?? '').trim(),
        order,
        metadata: {
          headingPath: [...headingPath],
          source: (imageMatch[2] ?? '').trim(),
          mediaKind: inferMediaKind(imageMatch[1] ?? '', imageMatch[2] ?? ''),
        },
      });
      order += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (heading !== null) {
      flushAllTextBuffers();
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

    const typstHeading = /^(=+)\s+(.+)$/.exec(line.trim());
    if (typstHeading !== null) {
      flushAllTextBuffers();
      const level = Math.min(typstHeading[1]?.length ?? 1, 6);
      const textValue = typstHeading[2]?.trim() ?? title;
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

    if (/^\|.+\|$/.test(line.trim())) {
      flushParagraph();
      tableBuffer.push(line.trim());
      continue;
    }

    if (/^[-*+]\s+/.test(line.trim())) {
      flushAllTextBuffers();
      blocks.push({
        id: `block_${String(order)}`,
        kind: 'list_item',
        text: line.trim().replace(/^[-*+]\s+/, ''),
        order,
        metadata: { headingPath: [...headingPath] },
      });
      order += 1;
      continue;
    }

    if (/^>\s?/.test(line.trim())) {
      flushAllTextBuffers();
      blocks.push({
        id: `block_${String(order)}`,
        kind: 'quote',
        text: line.trim().replace(/^>\s?/, ''),
        order,
        metadata: { headingPath: [...headingPath] },
      });
      order += 1;
      continue;
    }

    if (line.trim().length === 0) {
      flushAllTextBuffers();
      continue;
    }
    buffer.push(rawLine);
  }

  flushAllTextBuffers();

  if (blocks.length === 0) {
    blocks.push({
      id: 'block_0',
      kind: 'paragraph',
      text,
      order: 0,
      metadata: { headingPath: [] },
    });
  }

  return { rawText: buildRawText(blocks), language: 'und', blocks, parseWarnings: warnings, format };
}

function parseDelimitedTable(
  title: string,
  text: string,
  delimiter: ',' | '\t',
  format: DocumentFormat
): IParsedDocument {
  const lines = normalizeNewlines(text).split('\n').filter((line) => line.trim().length > 0);
  const blocks: IDocumentIrBlockDto[] = [];
  let order = 0;

  blocks.push({
    id: `block_${String(order)}`,
    kind: 'heading',
    text: title,
    level: 1,
    order,
    metadata: { headingPath: [title] },
  });
  order += 1;

  for (const line of lines) {
    const cells = splitDelimitedLine(line, delimiter);
    const rowText = cells.join(' | ').trim();
    if (rowText.length === 0) continue;
    blocks.push({
      id: `block_${String(order)}`,
      kind: 'table',
      text: rowText,
      order,
      metadata: { headingPath: [title], cellCount: cells.length },
    });
    order += 1;
  }

  return { rawText: buildRawText(blocks), language: 'und', blocks, parseWarnings: [], format };
}

function parseStructuredData(title: string, text: string, format: DocumentFormat): IParsedDocument {
  let pretty = text.trim();
  try {
    pretty = JSON.stringify(JSON.parse(text) as unknown, null, 2);
  } catch {
    // Keep original text if parsing fails; concept extraction can still scan the keys.
  }
  return {
    rawText: pretty,
    language: 'und',
    blocks: [
      {
        id: 'block_0',
        kind: 'heading',
        text: title,
        level: 1,
        order: 0,
        metadata: { headingPath: [title] },
      },
      {
        id: 'block_1',
        kind: 'code',
        text: pretty,
        order: 1,
        metadata: { headingPath: [title] },
      },
    ],
    parseWarnings: [],
    format,
  };
}

function parseYamlLike(title: string, text: string, format: DocumentFormat): IParsedDocument {
  return {
    rawText: normalizeNewlines(text).trim(),
    language: 'und',
    blocks: [
      {
        id: 'block_0',
        kind: 'heading',
        text: title,
        level: 1,
        order: 0,
        metadata: { headingPath: [title] },
      },
      {
        id: 'block_1',
        kind: 'code',
        text: normalizeNewlines(text).trim(),
        order: 1,
        metadata: { headingPath: [title] },
      },
    ],
    parseWarnings: [],
    format,
  };
}

function resolveDocumentFormat(document: IDocumentDto): DocumentFormat {
  const metadataFormat = document.metadata['documentFormat'];
  if (typeof metadataFormat === 'string' && isDocumentFormat(metadataFormat)) {
    return metadataFormat;
  }
  const title = document.title.toLowerCase();
  if (title.endsWith('.md') || title.endsWith('.markdown')) return 'markdown';
  if (title.endsWith('.html') || title.endsWith('.htm')) return 'html';
  if (title.endsWith('.csv')) return 'csv';
  if (title.endsWith('.tsv')) return 'tsv';
  if (title.endsWith('.json')) return 'json';
  if (title.endsWith('.yaml') || title.endsWith('.yml')) return 'yaml';
  if (title.endsWith('.tex')) return 'latex';
  if (title.endsWith('.typ') || title.endsWith('.typst')) return 'typst';
  if (title.endsWith('.pdf')) return 'pdf';
  if (title.endsWith('.docx')) return 'docx';
  if (title.endsWith('.xlsx')) return 'xlsx';
  if (title.endsWith('.epub')) return 'epub';
  const mimeKind = document.mimeKind as string;
  switch (mimeKind) {
    case 'text/markdown':
      return 'markdown';
    case 'text/html':
      return 'html';
    case 'text/csv':
      return 'csv';
    case 'text/tab-separated-values':
      return 'tsv';
    case 'application/json':
      return 'json';
    case 'application/pdf':
      return 'pdf';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'docx';
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return 'xlsx';
    case 'application/epub+zip':
      return 'epub';
    default:
      return 'plain_text';
  }
}

export function isDocumentFormat(value: string): value is DocumentFormat {
  return new Set<DocumentFormat>([
    'plain_text',
    'txt',
    'markdown',
    'html',
    'csv',
    'tsv',
    'json',
    'yaml',
    'latex',
    'typst',
    'pdf',
    'docx',
    'xlsx',
    'epub',
  ]).has(value as DocumentFormat);
}

function buildRawText(blocks: IDocumentIrBlockDto[]): string {
  return blocks
    .filter((block) => TEXT_BLOCK_KINDS.has(block.kind))
    .map((block) => block.text.trim())
    .filter((text) => text.length > 0)
    .join('\n\n')
    .trim();
}

function readHeadingPath(block: IDocumentIrBlockDto): string[] {
  const headingPath = block.metadata['headingPath'];
  return Array.isArray(headingPath) ? headingPath.filter((item): item is string => typeof item === 'string') : [];
}

function renderWindowUnit(headingPath: string[], kind: IDocumentIrBlockDto['kind'], text: string): string {
  const prefix = headingPath.length > 0 ? `[Section: ${headingPath.join(' > ')}]` : '[Section: document]';
  const kindLabel = kind === 'table' ? 'table' : kind === 'code' ? 'code' : 'text';
  return `${prefix}\n[Kind: ${kindLabel}]\n${text}`;
}

function longestHeadingPath(units: { headingPath: string[] }[]): string[] {
  let best: string[] = [];
  for (const unit of units) {
    if (unit.headingPath.length > best.length) best = unit.headingPath;
  }
  return best;
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

function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}

function estimateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(countWords(text) * 1.3));
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function splitDelimitedLine(line: string, delimiter: ',' | '\t'): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line.charAt(index);
    if (character === '"') {
      const next = line[index + 1];
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (character === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }
  cells.push(current.trim());
  return cells;
}

function htmlToMarkdownLike(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '\n')
      .replace(/<style[\s\S]*?<\/style>/gi, '\n')
      .replace(/<img\b([^>]*)>/gi, (_match, attrs: string) => {
        const alt = /alt\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? '';
        const src = /src\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? '';
        return `\n![${alt}](${src})\n`;
      })
      .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
      .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
      .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
      .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')
      .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n')
      .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n')
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1\n')
      .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '\n> $1\n')
      .replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (_match, row: string) => {
        const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
          stripHtml(cell[1] ?? '').trim()
        );
        return `\n| ${cells.join(' | ')} |\n`;
      })
      .replace(/<(p|div|section|article|pre|code)[^>]*>([\s\S]*?)<\/\1>/gi, '\n$2\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(ul|ol|table|tbody|thead)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  );
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ''));
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function inferMediaKind(altText: string, source: string): string {
  const lowered = `${altText} ${source}`.toLowerCase();
  if (lowered.includes('diagram') || lowered.includes('chart') || lowered.includes('figure')) {
    return 'diagram';
  }
  return 'image';
}
