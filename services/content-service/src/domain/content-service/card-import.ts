import type { CardState, DifficultyLevel, JsonValue, NodeId, StudyMode } from '@noema/types';
import { DifficultyLevel as DifficultyLevelEnum } from '@noema/types';
import { read, utils } from 'xlsx';
import type { ICreateCardInput } from '../../types/content.types.js';

export type CardImportFileType =
  | 'json'
  | 'jsonl'
  | 'csv'
  | 'tsv'
  | 'xlsx'
  | 'txt'
  | 'markdown'
  | 'latex'
  | 'typst';

export type CardImportTargetFieldId =
  | 'front'
  | 'back'
  | 'hint'
  | 'explanation'
  | 'tags'
  | 'knowledgeNodeIds'
  | 'difficulty'
  | 'state';

export type CardImportMappingTarget = CardImportTargetFieldId | 'dump';

export interface ICardImportSourceField {
  key: string;
  sample: string;
}

export interface ICardImportRecord {
  values: Record<string, string>;
}

export interface ICardImportFieldMapping {
  sourceKey: string;
  targetFieldId: CardImportMappingTarget;
  dumpKey?: string;
}

export interface ICardImportPreviewInput {
  fileName: string;
  fileType: CardImportFileType;
  formatId: string;
  payload: {
    encoding: 'text' | 'base64';
    content: string;
  };
  sheetName?: string;
  supportedStudyModes?: StudyMode[];
}

export interface ICardImportPreviewResult {
  fileName: string;
  fileType: CardImportFileType;
  formatId: string;
  sourceFields: ICardImportSourceField[];
  records: ICardImportRecord[];
  warnings: string[];
  sheetNames?: string[];
  suggestedMappings: ICardImportFieldMapping[];
}

export interface ICardImportExecuteInput extends ICardImportPreviewInput {
  mappings: ICardImportFieldMapping[];
  sharedTags?: string[];
  sharedKnowledgeNodeIds?: string[];
  sharedDifficulty?: DifficultyLevel;
  sharedState?: Extract<CardState, 'draft' | 'active'>;
  recordMetadata?: ICardImportRecordMetadataInput[];
}

export interface ICardImportRecordMetadataInput {
  index: number;
  tags?: string[];
  knowledgeNodeIds?: string[];
  difficulty?: DifficultyLevel;
  state?: Extract<CardState, 'draft' | 'active'>;
}

export interface IPreparedCardImport {
  cards: ICreateCardInput[];
  desiredStates: Extract<CardState, 'draft' | 'active'>[];
  warnings: string[];
}

const TARGET_FIELDS: CardImportTargetFieldId[] = [
  'front',
  'back',
  'hint',
  'explanation',
  'tags',
  'knowledgeNodeIds',
  'difficulty',
  'state',
];

export function previewCardImport(input: ICardImportPreviewInput): ICardImportPreviewResult {
  const warnings: string[] = [];
  const parsed = parseRecords(input, warnings);
  const sourceFields = collectSourceFields(parsed.records);

  return {
    fileName: input.fileName,
    fileType: input.fileType,
    formatId: input.formatId,
    sourceFields,
    records: parsed.records,
    warnings,
    ...(parsed.sheetNames !== undefined ? { sheetNames: parsed.sheetNames } : {}),
    suggestedMappings: sourceFields.map((field) => {
      const inferredTarget = inferMappingTarget(field.key);
      return inferredTarget === null
        ? { sourceKey: field.key, targetFieldId: 'dump', dumpKey: field.key }
        : { sourceKey: field.key, targetFieldId: inferredTarget };
    }),
  };
}

export function prepareImportedCards(
  preview: ICardImportPreviewResult,
  input: Pick<
    ICardImportExecuteInput,
    | 'mappings'
    | 'sharedDifficulty'
    | 'sharedKnowledgeNodeIds'
    | 'sharedState'
    | 'sharedTags'
    | 'recordMetadata'
    | 'supportedStudyModes'
  >
): IPreparedCardImport {
  const warnings = [...preview.warnings];
  const mappingBySource = new Map(input.mappings.map((mapping) => [mapping.sourceKey, mapping]));
  const metadataByIndex = new Map<number, ICardImportRecordMetadataInput>();
  const requiredTargets = new Set<CardImportTargetFieldId>(['front', 'back']);
  const assignedTargets = new Set<CardImportTargetFieldId>();

  for (const metadata of input.recordMetadata ?? []) {
    if (metadata.index < 0 || metadata.index >= preview.records.length) {
      throw new Error(`Record metadata index ${String(metadata.index)} is out of range.`);
    }
    if (metadataByIndex.has(metadata.index)) {
      throw new Error(`Record metadata for row ${String(metadata.index + 1)} is duplicated.`);
    }
    metadataByIndex.set(metadata.index, metadata);
  }

  for (const field of preview.sourceFields) {
    if (!mappingBySource.has(field.key)) {
      throw new Error(`Source field "${field.key}" is not mapped.`);
    }
  }

  for (const mapping of input.mappings) {
    if (mapping.targetFieldId !== 'dump') {
      if (assignedTargets.has(mapping.targetFieldId)) {
        throw new Error(`Target field "${mapping.targetFieldId}" is mapped more than once.`);
      }
      assignedTargets.add(mapping.targetFieldId);
    }
  }

  for (const target of requiredTargets) {
    if (!assignedTargets.has(target)) {
      throw new Error(`Required target field "${target}" is not mapped.`);
    }
  }

  const cards: ICreateCardInput[] = [];
  const desiredStates: Extract<CardState, 'draft' | 'active'>[] = [];

  for (let index = 0; index < preview.records.length; index += 1) {
    const record = preview.records[index];
    if (record === undefined) continue;

    const content: Record<string, JsonValue> = {};
    const dump: Record<string, string> = {};
    let recordTags = new Set<string>(input.sharedTags ?? []);
    let recordNodeIds = new Set<string>(input.sharedKnowledgeNodeIds ?? []);
    let difficulty = input.sharedDifficulty ?? DifficultyLevelEnum.INTERMEDIATE;
    let state = input.sharedState ?? 'draft';

    for (const mapping of input.mappings) {
      const rawValue = record.values[mapping.sourceKey] ?? '';
      const value = rawValue.trim();
      if (mapping.targetFieldId === 'dump') {
        if (value !== '') {
          const trimmedDumpKey = mapping.dumpKey?.trim();
          const dumpKey =
            trimmedDumpKey !== undefined && trimmedDumpKey !== ''
              ? trimmedDumpKey
              : mapping.sourceKey;
          dump[dumpKey] = rawValue;
        }
        continue;
      }

      if (value === '') continue;

      switch (mapping.targetFieldId) {
        case 'front':
        case 'back':
        case 'hint':
        case 'explanation':
          content[mapping.targetFieldId] = rawValue;
          break;
        case 'tags':
          for (const tag of splitList(rawValue)) recordTags.add(tag);
          break;
        case 'knowledgeNodeIds':
          for (const nodeId of splitList(rawValue)) recordNodeIds.add(nodeId);
          break;
        case 'difficulty': {
          const parsedDifficulty = normalizeDifficulty(rawValue);
          if (parsedDifficulty !== null) {
            difficulty = parsedDifficulty;
          } else {
            warnings.push(
              `Row ${String(index + 1)} has unsupported difficulty "${rawValue}". Falling back to ${difficulty}.`
            );
          }
          break;
        }
        case 'state': {
          const parsedState = normalizeState(rawValue);
          if (parsedState !== null) {
            state = parsedState;
          } else {
            warnings.push(
              `Row ${String(index + 1)} has unsupported state "${rawValue}". Falling back to ${state}.`
            );
          }
          break;
        }
      }
    }

    const manualMetadata = metadataByIndex.get(index);
    if (manualMetadata?.tags !== undefined) {
      recordTags = new Set(manualMetadata.tags);
    }
    if (manualMetadata?.knowledgeNodeIds !== undefined) {
      recordNodeIds = new Set(manualMetadata.knowledgeNodeIds);
    }
    if (manualMetadata?.difficulty !== undefined) {
      difficulty = manualMetadata.difficulty;
    }
    if (manualMetadata?.state !== undefined) {
      state = manualMetadata.state;
    }

    if (typeof content['front'] !== 'string' || content['front'].trim() === '') {
      throw new Error(`Row ${String(index + 1)} is missing Front side after mapping.`);
    }
    if (typeof content['back'] !== 'string' || content['back'].trim() === '') {
      throw new Error(`Row ${String(index + 1)} is missing Back side after mapping.`);
    }

    const metadata: Record<string, JsonValue> = {
      import: {
        fileType: preview.fileType,
        formatId: preview.formatId,
        fileName: preview.fileName,
      },
    };

    if (Object.keys(dump).length > 0) {
      metadata['dump'] = dump;
    }

    cards.push({
      cardType: 'atomic',
      content: content as unknown as ICreateCardInput['content'],
      difficulty,
      knowledgeNodeIds: Array.from(recordNodeIds) as NodeId[],
      tags: Array.from(recordTags),
      ...(input.supportedStudyModes !== undefined
        ? { supportedStudyModes: input.supportedStudyModes }
        : {}),
      source: 'import',
      metadata,
    });
    desiredStates.push(state);
  }

  return { cards, desiredStates, warnings };
}

function parseRecords(
  input: ICardImportPreviewInput,
  warnings: string[]
): { records: ICardImportRecord[]; sheetNames?: string[] } {
  if (input.fileType === 'xlsx') {
    const workbook = read(Buffer.from(input.payload.content, 'base64'), { type: 'buffer' });
    const sheetNames = workbook.SheetNames;
    const selectedSheet = input.sheetName ?? sheetNames[0];

    if (selectedSheet === undefined) {
      throw new Error('Workbook does not contain any sheets.');
    }

    if (sheetNames.length > 1 && input.sheetName === undefined) {
      warnings.push(
        `Workbook has ${String(sheetNames.length)} sheets. Previewing "${selectedSheet}" by default.`
      );
    }

    const sheet = workbook.Sheets[selectedSheet];
    if (sheet === undefined) {
      throw new Error(`Worksheet "${selectedSheet}" was not found in the uploaded workbook.`);
    }

    const rows = utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
    });

    return { records: normalizeObjectRows(rows), sheetNames };
  }

  const text = input.payload.content;

  switch (input.fileType) {
    case 'json':
      return { records: parseJson(text) };
    case 'jsonl':
      return { records: parseJsonLines(text) };
    case 'csv':
      return { records: parseDelimited(text, ',', warnings) };
    case 'tsv':
      return { records: parseDelimited(text, '\t', warnings) };
    case 'txt':
      return { records: parseTextLike(text, input.formatId, warnings, false) };
    case 'markdown':
      return { records: parseTextLike(text, input.formatId, warnings, true) };
    case 'latex':
      return { records: parseLatex(text, input.formatId, warnings) };
    case 'typst':
      return { records: parseTypst(text, input.formatId, warnings) };
    default:
      throw new Error('Unsupported file type.');
  }
}

function parseJson(text: string): ICardImportRecord[] {
  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('JSON imports must be a top-level array of objects.');
  }
  return normalizeObjectRows(parsed);
}

function parseJsonLines(text: string): ICardImportRecord[] {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as unknown);
  return normalizeObjectRows(rows);
}

function parseDelimited(text: string, delimiter: string, warnings: string[]): ICardImportRecord[] {
  const rows = splitCsvRows(text, delimiter);
  if (rows.length === 0) {
    throw new Error('The uploaded table is empty.');
  }

  const headers =
    rows[0]?.map((header, index) => {
      const trimmedHeader = header.trim();
      return trimmedHeader !== '' ? trimmedHeader : `Column ${String(index + 1)}`;
    }) ?? [];
  const records: ICardImportRecord[] = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (row === undefined) continue;
    if (row.every((cell) => cell.trim() === '')) continue;

    if (row.length !== headers.length) {
      warnings.push(
        `Row ${String(rowIndex + 1)} has ${String(row.length)} cells while the header has ${String(headers.length)}. Missing values were padded.`
      );
    }

    const values: Record<string, string> = {};
    headers.forEach((header, index) => {
      values[header] = row[index] ?? '';
    });
    records.push({ values });
  }

  return records;
}

function parseTextLike(
  text: string,
  formatId: string,
  warnings: string[],
  isMarkdown: boolean
): ICardImportRecord[] {
  if (formatId.includes('heading-answer')) {
    return parseHeadingDocuments(text, isMarkdown ? /^#{1,6}\s+/ : /^$/);
  }

  if (formatId.includes('question-answer')) {
    return parseQuestionAnswerBlocks(text, warnings);
  }

  if (formatId.includes('prompt-only')) {
    return splitBlocks(text).map((block) => ({ values: { prompt: block.trim() } }));
  }

  return splitBlocks(text).map((block, index) => {
    const [front, ...backParts] = block.split(/\r?\n---\r?\n/);
    if (backParts.length === 0) {
      warnings.push(
        `Block ${String(index + 1)} did not include a --- divider. Back side is empty.`
      );
    }
    return {
      values: {
        front: front?.trim() ?? '',
        back: backParts.join('\n---\n').trim(),
      },
    };
  });
}

function parseHeadingDocuments(text: string, headingPattern: RegExp): ICardImportRecord[] {
  const lines = text.split(/\r?\n/);
  const records: ICardImportRecord[] = [];
  let currentHeading = '';
  let body: string[] = [];

  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line) || /^=\s+/.test(line)) {
      if (currentHeading.trim() !== '') {
        records.push({
          values: {
            heading: currentHeading.trim(),
            answer: body.join('\n').trim(),
          },
        });
      }
      currentHeading = line.replace(headingPattern, '').trim();
      body = [];
      continue;
    }
    body.push(line);
  }

  if (currentHeading.trim() !== '') {
    records.push({
      values: {
        heading: currentHeading.trim(),
        answer: body.join('\n').trim(),
      },
    });
  }

  return records;
}

function parseQuestionAnswerBlocks(text: string, warnings: string[]): ICardImportRecord[] {
  return splitBlocks(text).map((block, index) => {
    const values: Record<string, string> = {};
    for (const line of block.split(/\r?\n/)) {
      const match = /^(Q|A|H|E|TAGS?|NODES?|DIFFICULTY|STATE)\s*:\s*(.*)$/i.exec(line.trim());
      if (match === null) continue;
      const key = match[1]?.toLowerCase() ?? '';
      const value = match[2] ?? '';

      if (key === 'q') values['question'] = value;
      else if (key === 'a') values['answer'] = value;
      else if (key === 'h') values['hint'] = value;
      else if (key === 'e') values['explanation'] = value;
      else if (key.startsWith('tag')) values['tags'] = value;
      else if (key.startsWith('node')) values['knowledgeNodeIds'] = value;
      else if (key === 'difficulty') values['difficulty'] = value;
      else if (key === 'state') values['state'] = value;
    }

    if (values['question'] === undefined || values['answer'] === undefined) {
      warnings.push(`Block ${String(index + 1)} is missing Q: or A: markers.`);
    }

    return { values };
  });
}

function parseLatex(text: string, formatId: string, warnings: string[]): ICardImportRecord[] {
  if (formatId === 'latex-card-command') {
    return [...text.matchAll(/\\card\{([\s\S]*?)\}\{([\s\S]*?)\}/g)].map((match) => ({
      values: { front: cleanWrapped(match[1]), back: cleanWrapped(match[2]) },
    }));
  }

  if (formatId === 'latex-front-back-environment') {
    return [...text.matchAll(/\\begin\{card\}([\s\S]*?)\\end\{card\}/g)].map((match) => ({
      values: {
        front: cleanWrapped(/\\front\{([\s\S]*?)\}/.exec(match[1] ?? '')?.[1]),
        back: cleanWrapped(/\\back\{([\s\S]*?)\}/.exec(match[1] ?? '')?.[1]),
      },
    }));
  }

  const records = [...text.matchAll(/\\question\{([\s\S]*?)\}\s*\\answer\{([\s\S]*?)\}/g)].map(
    (match) => ({
      values: { question: cleanWrapped(match[1]), answer: cleanWrapped(match[2]) },
    })
  );

  if (records.length === 0) {
    warnings.push('No \\question{...}\\answer{...} pairs were found.');
  }

  return records;
}

function parseTypst(text: string, formatId: string, warnings: string[]): ICardImportRecord[] {
  if (formatId === 'typst-card-function') {
    const matches = [
      ...text.matchAll(
        /#card\s*\(\s*front:\s*"([\s\S]*?)"\s*,\s*back:\s*"([\s\S]*?)"(?:\s*,\s*hint:\s*"([\s\S]*?)")?\s*\)/g
      ),
    ];
    return matches.map((match) => ({
      values: {
        front: match[1] ?? '',
        back: match[2] ?? '',
        hint: match[3] ?? '',
      },
    }));
  }

  if (formatId === 'typst-heading-answer') {
    return parseHeadingDocuments(text, /^=\s+/);
  }

  return parseQuestionAnswerBlocks(text, warnings);
}

function normalizeObjectRows(rows: unknown[]): ICardImportRecord[] {
  return rows.map((row, index) => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      throw new Error(`Row ${String(index + 1)} is not an object.`);
    }

    const values: Record<string, string> = {};
    Object.entries(row).forEach(([key, value]) => {
      values[key] = stringifyCell(value);
    });
    return { values };
  });
}

function collectSourceFields(records: ICardImportRecord[]): ICardImportSourceField[] {
  const keys = new Set<string>();
  records.forEach((record) => {
    Object.keys(record.values).forEach((key) => keys.add(key));
  });

  return Array.from(keys).map((key) => ({
    key,
    sample: records.find((record) => (record.values[key] ?? '').trim() !== '')?.values[key] ?? '',
  }));
}

function inferMappingTarget(key: string): CardImportTargetFieldId | null {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (matchesAny(normalized, ['front', 'question', 'prompt', 'term', 'title', 'heading']))
    return 'front';
  if (matchesAny(normalized, ['back', 'answer', 'definition', 'response', 'body'])) return 'back';
  if (matchesAny(normalized, ['hint', 'clue'])) return 'hint';
  if (matchesAny(normalized, ['explanation', 'reasoning', 'notes', 'note'])) return 'explanation';
  if (matchesAny(normalized, ['tags', 'labels', 'keywords'])) return 'tags';
  if (matchesAny(normalized, ['knowledgenodeids', 'nodeids', 'nodes'])) return 'knowledgeNodeIds';
  if (matchesAny(normalized, ['difficulty', 'level'])) return 'difficulty';
  if (matchesAny(normalized, ['state', 'status'])) return 'state';
  return null;
}

function matchesAny(value: string, candidates: string[]): boolean {
  return candidates.some((candidate) => value.includes(candidate));
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function splitBlocks(text: string): string[] {
  return text
    .split(/\r?\n\s*\r?\n/g)
    .map((block) => block.trim())
    .filter((block) => block !== '');
}

function splitList(raw: string): string[] {
  return raw
    .split(/[,\n;]+/g)
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

function normalizeDifficulty(raw: string): DifficultyLevel | null {
  const value = raw.trim().toLowerCase();
  if (TARGET_FIELDS.includes(value as CardImportTargetFieldId)) return null;
  if (
    value === DifficultyLevelEnum.BEGINNER ||
    value === DifficultyLevelEnum.ELEMENTARY ||
    value === DifficultyLevelEnum.INTERMEDIATE ||
    value === DifficultyLevelEnum.ADVANCED ||
    value === DifficultyLevelEnum.EXPERT
  ) {
    return value;
  }

  const numeric = Number.parseFloat(value);
  if (Number.isNaN(numeric)) return null;
  if (numeric <= 0.2) return DifficultyLevelEnum.BEGINNER;
  if (numeric <= 0.4) return DifficultyLevelEnum.ELEMENTARY;
  if (numeric <= 0.6) return DifficultyLevelEnum.INTERMEDIATE;
  if (numeric <= 0.8) return DifficultyLevelEnum.ADVANCED;
  return DifficultyLevelEnum.EXPERT;
}

function normalizeState(raw: string): Extract<CardState, 'draft' | 'active'> | null {
  const value = raw.trim().toLowerCase();
  if (value === 'draft') return 'draft';
  if (value === 'active' || value === 'published' || value === 'ready') return 'active';
  return null;
}

function splitCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += char ?? '';
  }

  currentRow.push(currentCell);
  rows.push(currentRow);
  return rows.filter((row) => !(row.length === 1 && row[0]?.trim() === ''));
}

function cleanWrapped(value: string | undefined): string {
  return (value ?? '').trim();
}
