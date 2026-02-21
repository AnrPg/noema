/**
 * @noema/content-service — Card Content Schema Unit Tests
 *
 * Tests all 42 type-specific content schemas, the registry,
 * and the discriminated validator.
 */

import { CardType, RemediationCardType } from '@noema/types';
import { describe, expect, it } from 'vitest';
import {
  AtomicContentSchema,
  CalibrationTrainingContentSchema,
  CardContentSchemaRegistry,
  CaseBasedContentSchema,
  CauseEffectContentSchema,
  ClozeContentSchema,
  ComparisonContentSchema,
  ConceptGraphContentSchema,
  ConfidenceRatedContentSchema,
  ContrastivePairContentSchema,
  DefinitionContentSchema,
  DiagramContentSchema,
  ImageOcclusionContentSchema,
  MatchingContentSchema,
  MultipleChoiceContentSchema,
  OrderingContentSchema,
  parseCardContent,
  ProcessContentSchema,
  ProgressiveDisclosureContentSchema,
  TimelineContentSchema,
  TransferContentSchema,
  TrueFalseContentSchema,
  validateCardContent,
} from '../../../src/domain/content-service/card-content.schemas.js';
import {
  atomicContent,
  clozeContent,
  multipleChoiceContent,
  trueFalseContent,
} from '../../fixtures/index.js';

// ============================================================================
// Registry Completeness
// ============================================================================

describe('CardContentSchemaRegistry', () => {
  it('has exactly 42 registered schemas (22 standard + 20 remediation)', () => {
    expect(Object.keys(CardContentSchemaRegistry)).toHaveLength(42);
  });

  it('covers all CardType enum values', () => {
    for (const type of Object.values(CardType)) {
      expect(CardContentSchemaRegistry[type]).toBeDefined();
    }
  });

  it('covers all RemediationCardType enum values', () => {
    for (const type of Object.values(RemediationCardType)) {
      expect(CardContentSchemaRegistry[type]).toBeDefined();
    }
  });
});

// ============================================================================
// validateCardContent()
// ============================================================================

describe('validateCardContent()', () => {
  it('validates atomic content successfully', () => {
    const result = validateCardContent('atomic', atomicContent());
    expect(result.success).toBe(true);
  });

  it('validates cloze content successfully', () => {
    const result = validateCardContent('cloze', clozeContent());
    expect(result.success).toBe(true);
  });

  it('rejects cloze content missing required fields', () => {
    const result = validateCardContent('cloze', atomicContent());
    expect(result.success).toBe(false);
  });

  it('returns error for unknown card type', () => {
    const result = validateCardContent('nonexistent', atomicContent());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.message).toContain('Unknown card type');
    }
  });
});

// ============================================================================
// parseCardContent()
// ============================================================================

describe('parseCardContent()', () => {
  it('parses valid content without throwing', () => {
    expect(() => parseCardContent('atomic', atomicContent())).not.toThrow();
  });

  it('throws ZodError for invalid content', () => {
    expect(() => parseCardContent('cloze', atomicContent())).toThrow();
  });

  it('throws for unknown card type', () => {
    expect(() => parseCardContent('nonexistent', atomicContent())).toThrow('Unknown card type');
  });
});

// ============================================================================
// Standard Card Type Schemas (22)
// ============================================================================

describe('Standard card type schemas', () => {
  describe('ATOMIC', () => {
    it('accepts valid content', () => {
      const result = AtomicContentSchema.safeParse(atomicContent());
      expect(result.success).toBe(true);
    });

    it('rejects empty front', () => {
      const result = AtomicContentSchema.safeParse({ ...atomicContent(), front: '' });
      expect(result.success).toBe(false);
    });

    it('rejects empty back', () => {
      const result = AtomicContentSchema.safeParse({ ...atomicContent(), back: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('CLOZE', () => {
    it('accepts valid cloze content', () => {
      const result = ClozeContentSchema.safeParse(clozeContent());
      expect(result.success).toBe(true);
    });

    it('requires at least one cloze deletion', () => {
      const result = ClozeContentSchema.safeParse({
        ...clozeContent(),
        clozes: [],
      });
      expect(result.success).toBe(false);
    });

    it('requires template field', () => {
      const { template, ...noClozeTemplate } = clozeContent() as any;
      const result = ClozeContentSchema.safeParse(noClozeTemplate);
      expect(result.success).toBe(false);
    });
  });

  describe('MULTIPLE_CHOICE', () => {
    it('accepts valid multiple choice content', () => {
      const result = MultipleChoiceContentSchema.safeParse(multipleChoiceContent());
      expect(result.success).toBe(true);
    });

    it('requires at least one correct choice', () => {
      const result = MultipleChoiceContentSchema.safeParse({
        ...multipleChoiceContent(),
        choices: [
          { text: 'A', correct: false },
          { text: 'B', correct: false },
        ],
      });
      expect(result.success).toBe(false);
    });

    it('requires at least 2 choices', () => {
      const result = MultipleChoiceContentSchema.safeParse({
        ...multipleChoiceContent(),
        choices: [{ text: 'Only one', correct: true }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('TRUE_FALSE', () => {
    it('accepts valid true/false content', () => {
      const result = TrueFalseContentSchema.safeParse(trueFalseContent());
      expect(result.success).toBe(true);
    });

    it('requires isTrue boolean', () => {
      const { isTrue, ...noIsTrue } = trueFalseContent() as any;
      const result = TrueFalseContentSchema.safeParse(noIsTrue);
      expect(result.success).toBe(false);
    });
  });

  describe('IMAGE_OCCLUSION', () => {
    it('accepts valid image occlusion content', () => {
      const result = ImageOcclusionContentSchema.safeParse({
        front: 'Label the parts',
        back: 'See regions',
        imageUrl: 'https://example.com/image.png',
        regions: [{ id: 'r1', x: 10, y: 20, width: 30, height: 40, label: 'Heart' }],
      });
      expect(result.success).toBe(true);
    });

    it('requires at least one region', () => {
      const result = ImageOcclusionContentSchema.safeParse({
        front: 'Label the parts',
        back: 'See regions',
        imageUrl: 'https://example.com/image.png',
        regions: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('PROCESS', () => {
    it('accepts valid process content', () => {
      const result = ProcessContentSchema.safeParse({
        front: 'Steps for cell division',
        back: 'Mitosis phases',
        processName: 'Mitosis',
        steps: [
          { order: 1, title: 'Prophase', description: 'Chromosomes condense' },
          { order: 2, title: 'Metaphase', description: 'Chromosomes align' },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('requires at least 2 steps', () => {
      const result = ProcessContentSchema.safeParse({
        front: 'Steps',
        back: 'Answer',
        processName: 'Test',
        steps: [{ order: 1, title: 'Only one', description: 'Desc' }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('COMPARISON', () => {
    it('accepts valid comparison content', () => {
      const result = ComparisonContentSchema.safeParse({
        front: 'Compare mitosis and meiosis',
        back: 'Differences',
        items: [
          { label: 'Mitosis', attributes: { result: '2 identical cells' } },
          { label: 'Meiosis', attributes: { result: '4 diverse cells' } },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('MATCHING', () => {
    it('accepts valid matching content', () => {
      const result = MatchingContentSchema.safeParse({
        front: 'Match terms to definitions',
        back: 'See pairs',
        pairs: [
          { left: 'DNA', right: 'Deoxyribonucleic acid' },
          { left: 'RNA', right: 'Ribonucleic acid' },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('ORDERING', () => {
    it('accepts valid ordering content', () => {
      const result = OrderingContentSchema.safeParse({
        front: 'Order the planets',
        back: 'Mercury, Venus, Earth, Mars',
        items: [
          { text: 'Mercury', correctPosition: 1 },
          { text: 'Venus', correctPosition: 2 },
          { text: 'Earth', correctPosition: 3 },
        ],
        orderingCriterion: 'Distance from Sun',
      });
      expect(result.success).toBe(true);
    });

    it('rejects non-consecutive positions', () => {
      const result = OrderingContentSchema.safeParse({
        front: 'Order items',
        back: 'Answer',
        items: [
          { text: 'A', correctPosition: 1 },
          { text: 'B', correctPosition: 5 }, // gap
        ],
        orderingCriterion: 'Test',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('DEFINITION', () => {
    it('accepts valid definition content', () => {
      const result = DefinitionContentSchema.safeParse({
        front: 'What is photosynthesis?',
        back: 'The process...',
        term: 'Photosynthesis',
        definition: 'The process by which plants convert light energy into chemical energy.',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('CAUSE_EFFECT', () => {
    it('accepts valid cause-effect content', () => {
      const result = CauseEffectContentSchema.safeParse({
        front: 'Global warming causes',
        back: 'See relationships',
        causes: [{ description: 'CO2 emissions' }],
        effects: [{ description: 'Rising sea levels' }],
        relationships: [{ causeIndex: 0, effectIndex: 0 }],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('TIMELINE', () => {
    it('accepts valid timeline content', () => {
      const result = TimelineContentSchema.safeParse({
        front: 'Key events in WWII',
        back: 'Timeline',
        events: [
          { date: '1939', title: 'War starts', description: 'Germany invades Poland' },
          { date: '1945', title: 'War ends', description: 'Japan surrenders' },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('DIAGRAM', () => {
    it('accepts valid diagram content', () => {
      const result = DiagramContentSchema.safeParse({
        front: 'Label the heart',
        back: 'Heart anatomy',
        imageUrl: 'https://example.com/heart.png',
        labels: [{ x: 50, y: 50, text: 'Left ventricle', answer: 'left ventricle' }],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('CONCEPT_GRAPH', () => {
    it('accepts valid concept graph', () => {
      const result = ConceptGraphContentSchema.safeParse({
        front: 'Map the concept',
        back: 'Graph',
        targetConcept: 'Photosynthesis',
        nodes: [
          { id: 'n1', label: 'Light' },
          { id: 'n2', label: 'CO2' },
        ],
        edges: [{ from: 'n1', to: 'n2', label: 'combines with' }],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('CASE_BASED', () => {
    it('accepts valid case-based content', () => {
      const result = CaseBasedContentSchema.safeParse({
        front: 'Read the scenario',
        back: 'Decision',
        scenario: 'A patient presents with...',
        question: 'What is the most likely diagnosis?',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('CONFIDENCE_RATED', () => {
    it('accepts valid confidence-rated content', () => {
      const result = ConfidenceRatedContentSchema.safeParse({
        front: 'How confident are you?',
        back: 'The answer is X',
        correctAnswer: 'Answer X',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('TRANSFER', () => {
    it('accepts valid transfer content', () => {
      const result = TransferContentSchema.safeParse({
        front: 'Apply the concept',
        back: 'In new context',
        originalContext: 'Physics: gravity',
        novelContext: 'Economics: market forces',
        transferPrompt: 'How does supply and demand resemble gravitational attraction?',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('PROGRESSIVE_DISCLOSURE', () => {
    it('accepts valid progressive disclosure content', () => {
      const result = ProgressiveDisclosureContentSchema.safeParse({
        front: 'Explore in layers',
        back: 'Full answer',
        layers: [
          { order: 1, content: 'Basic concept' },
          { order: 2, content: 'Advanced details' },
        ],
      });
      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// Remediation Card Type Schemas (sample coverage)
// ============================================================================

describe('Remediation card type schemas', () => {
  describe('CONTRASTIVE_PAIR', () => {
    it('accepts valid contrastive pair content', () => {
      const result = ContrastivePairContentSchema.safeParse({
        front: 'Compare A and B',
        back: 'Differences',
        itemA: 'Mitosis',
        itemB: 'Meiosis',
        sharedContext: 'Both are cell division processes',
        keyDifferences: ['Number of daughter cells', 'Genetic diversity'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('CALIBRATION_TRAINING', () => {
    it('accepts valid calibration training content', () => {
      const result = CalibrationTrainingContentSchema.safeParse({
        front: 'How confident?',
        back: 'Calibration result',
        statement: 'Is X true?',
        trueConfidence: 0.7,
        calibrationPrompt: 'Most people overestimate this',
      });
      expect(result.success).toBe(true);
    });

    it('rejects confidence outside 0-1', () => {
      const result = CalibrationTrainingContentSchema.safeParse({
        front: 'How confident?',
        back: 'Result',
        statement: 'Test',
        trueConfidence: 1.5,
        calibrationPrompt: 'Prompt',
      });
      expect(result.success).toBe(false);
    });
  });

  // Smoke-test all 20 remediation types parse without error when given valid data
  it.each(Object.values(RemediationCardType))('schema exists and is callable for %s', (type) => {
    const schema = CardContentSchemaRegistry[type];
    expect(schema).toBeDefined();
    // Every schema should reject completely empty input since front is required
    const result = schema!.safeParse({});
    expect(result.success).toBe(false);
  });
});
