import { describe, expect, it } from 'vitest';
import { write, utils } from 'xlsx';
import {
  prepareImportedCards,
  previewCardImport,
} from '../../../src/domain/content-service/card-import.js';

describe('card import preview', () => {
  it('parses CSV rows and infers mappings', () => {
    const result = previewCardImport({
      fileName: 'cards.csv',
      fileType: 'csv',
      formatId: 'csv-front-back',
      payload: {
        encoding: 'text',
        content: ['Question,Answer,Tags', 'Q1,A1,alpha;beta', 'Q2,A2,gamma'].join('\n'),
      },
    });

    expect(result.records).toHaveLength(2);
    expect(result.sourceFields.map((field) => field.key)).toEqual(['Question', 'Answer', 'Tags']);
    expect(result.suggestedMappings).toEqual([
      { sourceKey: 'Question', targetFieldId: 'front', dumpKey: undefined },
      { sourceKey: 'Answer', targetFieldId: 'back', dumpKey: undefined },
      { sourceKey: 'Tags', targetFieldId: 'tags', dumpKey: undefined },
    ]);
  });

  it('parses xlsx workbooks and reports sheet names', () => {
    const workbook = utils.book_new();
    const sheet = utils.json_to_sheet([{ Front: 'Q1', Back: 'A1' }]);
    utils.book_append_sheet(workbook, sheet, 'Deck');

    const result = previewCardImport({
      fileName: 'cards.xlsx',
      fileType: 'xlsx',
      formatId: 'xlsx-single-sheet',
      payload: {
        encoding: 'base64',
        content: write(workbook, { type: 'base64', bookType: 'xlsx' }),
      },
    });

    expect(result.sheetNames).toEqual(['Deck']);
    expect(result.records).toEqual([{ values: { Front: 'Q1', Back: 'A1' } }]);
  });

  it('parses latex card commands', () => {
    const result = previewCardImport({
      fileName: 'deck.tex',
      fileType: 'latex',
      formatId: 'latex-card-command',
      payload: {
        encoding: 'text',
        content: '\\card{What is a monoid?}{A semigroup with identity}',
      },
    });

    expect(result.records).toEqual([
      { values: { front: 'What is a monoid?', back: 'A semigroup with identity' } },
    ]);
  });
});

describe('card import execution prep', () => {
  it('preserves unmapped fields in metadata dump', () => {
    const preview = previewCardImport({
      fileName: 'cards.json',
      fileType: 'json',
      formatId: 'json-array',
      payload: {
        encoding: 'text',
        content: JSON.stringify([{ prompt: 'Q', answer: 'A', topic: 'Logic' }]),
      },
    });

    const prepared = prepareImportedCards(preview, {
      mappings: [
        { sourceKey: 'prompt', targetFieldId: 'front' },
        { sourceKey: 'answer', targetFieldId: 'back' },
        { sourceKey: 'topic', targetFieldId: 'dump', dumpKey: 'topic' },
      ],
      sharedDifficulty: 'intermediate',
      sharedKnowledgeNodeIds: [],
      sharedState: 'active',
      sharedTags: ['imported'],
    });

    expect(prepared.cards[0]?.content).toEqual({ front: 'Q', back: 'A' });
    expect(prepared.cards[0]?.metadata).toEqual({
      import: {
        fileType: 'json',
        formatId: 'json-array',
        fileName: 'cards.json',
      },
      dump: { topic: 'Logic' },
    });
    expect(prepared.desiredStates).toEqual(['active']);
  });

  it('applies per-record metadata overrides on top of import mapping', () => {
    const preview = previewCardImport({
      fileName: 'cards.csv',
      fileType: 'csv',
      formatId: 'csv-front-back',
      payload: {
        encoding: 'text',
        content: [
          'Front,Back,Tags,Difficulty,State',
          'Q1,A1,alpha,beginner,draft',
          'Q2,A2,beta,advanced,active',
        ].join('\n'),
      },
    });

    const prepared = prepareImportedCards(preview, {
      mappings: [
        { sourceKey: 'Front', targetFieldId: 'front' },
        { sourceKey: 'Back', targetFieldId: 'back' },
        { sourceKey: 'Tags', targetFieldId: 'tags' },
        { sourceKey: 'Difficulty', targetFieldId: 'difficulty' },
        { sourceKey: 'State', targetFieldId: 'state' },
      ],
      sharedDifficulty: 'intermediate',
      sharedKnowledgeNodeIds: ['node_abcdefghijklmnopqrstu'],
      sharedState: 'draft',
      sharedTags: ['imported'],
      recordMetadata: [
        {
          index: 0,
          tags: ['custom-tag'],
          knowledgeNodeIds: ['node_bcdefghijklmnopqrstuv'],
          difficulty: 'expert',
          state: 'active',
        },
      ],
    });

    expect(prepared.cards[0]?.tags).toEqual(['custom-tag']);
    expect(prepared.cards[0]?.knowledgeNodeIds).toEqual(['node_bcdefghijklmnopqrstuv']);
    expect(prepared.cards[0]?.difficulty).toBe('expert');
    expect(prepared.desiredStates[0]).toBe('active');

    expect(prepared.cards[1]?.tags).toEqual(expect.arrayContaining(['imported', 'beta']));
    expect(prepared.cards[1]?.knowledgeNodeIds).toEqual(['node_abcdefghijklmnopqrstu']);
    expect(prepared.cards[1]?.difficulty).toBe('advanced');
    expect(prepared.desiredStates[1]).toBe('active');
  });
});
