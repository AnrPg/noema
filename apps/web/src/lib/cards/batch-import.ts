export type BatchImportFileType =
  | 'json'
  | 'jsonl'
  | 'csv'
  | 'tsv'
  | 'xlsx'
  | 'txt'
  | 'markdown'
  | 'latex'
  | 'typst';

export interface IBatchImportFormatDefinition {
  id: string;
  label: string;
  description: string;
  insight: string;
}

export interface IBatchImportFileTypeDefinition {
  id: BatchImportFileType;
  label: string;
  extensions: string;
  description: string;
  insight: string;
  formats: IBatchImportFormatDefinition[];
}

export const BATCH_IMPORT_ACCEPT =
  '.json,.jsonl,.csv,.tsv,.xlsx,.txt,.md,.markdown,.tex,.typ,application/json,text/csv,text/tab-separated-values,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function createFormats(
  formats: [string, string, string, string][]
): IBatchImportFormatDefinition[] {
  return formats.map(([id, label, description, insight]) => ({
    id,
    label,
    description,
    insight,
  }));
}

export const BATCH_IMPORT_FILE_TYPES: IBatchImportFileTypeDefinition[] = [
  {
    id: 'json',
    label: 'JSON',
    extensions: '.json',
    description: 'Structured exports where each item is already an object with named fields.',
    insight: 'Best when your data already looks like rows with explicit keys.',
    formats: createFormats([
      [
        'json-array',
        'Array of objects',
        'A top-level array where each object is one import row.',
        'Ideal for API exports and scripted migrations.',
      ],
      [
        'json-content-objects',
        'Content-oriented objects',
        'Objects are already close to card payloads but still need explicit mapping.',
        'Useful when you want to inspect source fields before import.',
      ],
      [
        'json-metadata-heavy',
        'Metadata-heavy objects',
        'Objects carry many extra fields that should be preserved in dump metadata.',
        'Good for lossless migrations from operational systems.',
      ],
    ]),
  },
  {
    id: 'jsonl',
    label: 'JSON Lines',
    extensions: '.jsonl',
    description: 'One JSON object per line, common in streamed or generated exports.',
    insight: 'Great when data is produced incrementally but each line is already a row.',
    formats: createFormats([
      [
        'jsonl-rows',
        'Object per line',
        'Every non-empty line is a complete JSON object.',
        'The cleanest option for model outputs and append-only feeds.',
      ],
      [
        'jsonl-front-back',
        'Front/back objects',
        'Line objects mostly carry question and answer style fields.',
        'Works well for lightweight flashcard exports.',
      ],
      [
        'jsonl-rich-records',
        'Rich records with extras',
        'Line objects include additional metadata you want to preserve.',
        'Lets you promote only a subset of fields into cards.',
      ],
    ]),
  },
  {
    id: 'csv',
    label: 'CSV',
    extensions: '.csv',
    description: 'Spreadsheet-style rows with a header line and one record per line.',
    insight: 'A strong default when your data already lives in columns.',
    formats: createFormats([
      [
        'csv-front-back',
        'Front/back columns',
        'Separate columns already hold prompt and answer.',
        'The most predictable format for atomic card imports.',
      ],
      [
        'csv-question-answer-metadata',
        'Question/answer plus metadata',
        'Rows also include tags, notes, state, or difficulty columns.',
        'Helpful for editorial backlog spreadsheets.',
      ],
      [
        'csv-wide-table',
        'Wide table with extras',
        'Only some columns become card fields and the rest should be preserved.',
        'Good for exhaustive imports from messy operational sheets.',
      ],
    ]),
  },
  {
    id: 'tsv',
    label: 'TSV',
    extensions: '.tsv',
    description: 'Tab-separated tables, useful when cells contain commas freely.',
    insight: 'Safer than CSV for text-heavy exports.',
    formats: createFormats([
      [
        'tsv-front-back',
        'Front/back columns',
        'Dedicated prompt and answer columns separated by tabs.',
        'Excellent for delimiter-safe text imports.',
      ],
      [
        'tsv-review-deck',
        'Review deck table',
        'Rows mix prompt, answer, hints, and notes.',
        'Useful for study guides and analyst-built sheets.',
      ],
      [
        'tsv-wide-table',
        'Wide table with extras',
        'Many columns should survive in dump metadata.',
        'Best for lossless tabular migrations.',
      ],
    ]),
  },
  {
    id: 'xlsx',
    label: 'Excel Workbook',
    extensions: '.xlsx',
    description: 'Workbook files with one or more worksheets.',
    insight: 'Choose this when worksheet structure matters and CSV would lose context.',
    formats: createFormats([
      [
        'xlsx-single-sheet',
        'Single sheet table',
        'One worksheet contains the whole import table with headers.',
        'Closest to CSV while preserving workbook structure.',
      ],
      [
        'xlsx-multi-sheet',
        'Workbook with several relevant sheets',
        'You want to choose the sheet that best matches your data.',
        'Helpful for editorial or research workbooks.',
      ],
      [
        'xlsx-wide-sheet',
        'Wide sheet with many source columns',
        'Only part of the sheet becomes card fields and the rest becomes dump metadata.',
        'Good for preserving surrounding context from planning sheets.',
      ],
    ]),
  },
  {
    id: 'txt',
    label: 'Plain Text',
    extensions: '.txt',
    description: 'Human-authored text files that can still be segmented into card records.',
    insight: 'Best for simple notes that are not already tabular.',
    formats: createFormats([
      [
        'txt-front-back-blocks',
        'Front/back blocks',
        'Separate cards by blank lines and use --- between front and back.',
        'The clearest authored plain-text import pattern.',
      ],
      [
        'txt-question-answer-markers',
        'Q:/A: markers',
        'Each card uses explicit labels like Q: and A:.',
        'Great for interview notes and study guides.',
      ],
      [
        'txt-prompt-only',
        'Prompt-only blocks',
        'Each paragraph is a prompt and the rest will be preserved as dump metadata.',
        'Useful when you want to scaffold cards from outlines.',
      ],
    ]),
  },
  {
    id: 'markdown',
    label: 'Markdown',
    extensions: '.md, .markdown',
    description: 'Markdown notes with headings, blocks, and lightweight structure.',
    insight: 'A strong fit for knowledge notes because formatting is preserved.',
    formats: createFormats([
      [
        'md-front-back-blocks',
        'Front/back blocks',
        'Use the same block structure as plain text while keeping Markdown intact.',
        'Great when answers contain lists, emphasis, or code.',
      ],
      [
        'md-heading-answer',
        'Heading plus answer body',
        'Each heading becomes a front side and the following body becomes the back.',
        'Works well for note systems organized by sections.',
      ],
      [
        'md-question-answer-markers',
        'Q:/A: markers',
        'Markdown is present but semantics still come from labeled prompts.',
        'Good for imported study guides with rich formatting.',
      ],
    ]),
  },
  {
    id: 'latex',
    label: 'LaTeX',
    extensions: '.tex',
    description: 'Technical documents where commands and environments encode structure.',
    insight: 'Best when semantic LaTeX macros already delimit card-shaped content.',
    formats: createFormats([
      [
        'latex-card-command',
        'Card command macros',
        'Cards are written as macros like \\card{front}{back}.',
        'The cleanest LaTeX-native import path.',
      ],
      [
        'latex-front-back-environment',
        'Front/back environments',
        'Cards are wrapped in an environment with explicit front and back blocks.',
        'Good for structured technical authoring workflows.',
      ],
      [
        'latex-question-answer',
        'Question/answer macros',
        'Prompts and answers are expressed through \\question and \\answer style macros.',
        'Useful for exercises, theorem notes, and solutions.',
      ],
    ]),
  },
  {
    id: 'typst',
    label: 'Typst',
    extensions: '.typ',
    description: 'Typst documents where functions and blocks express reusable semantic content.',
    insight: 'Best when notes use Typst as a structured authoring format rather than plain prose.',
    formats: createFormats([
      [
        'typst-card-function',
        'Card functions',
        'Items are authored with a function like #card(front: ..., back: ...).',
        'The most reliable Typst-native import path.',
      ],
      [
        'typst-heading-answer',
        'Heading plus answer body',
        'Headings introduce prompts and the following content becomes the answer.',
        'Helpful for concept notes with minimal conversion work.',
      ],
      [
        'typst-question-answer',
        'Question/answer markers',
        'The source uses explicit Q:/A: style markers inside Typst text.',
        'Good for mixed prose documents with simple semantics.',
      ],
    ]),
  },
];

export function getBatchImportFileTypeDefinition(
  id: BatchImportFileType
): IBatchImportFileTypeDefinition {
  const definition = BATCH_IMPORT_FILE_TYPES.find((fileType) => fileType.id === id);
  if (definition === undefined) {
    throw new Error(`Unknown batch import file type: ${id}`);
  }
  return definition;
}
