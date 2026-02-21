/**
 * @noema/content-service — Test Fixtures
 *
 * Reusable test data factories for cards, templates, media, and contexts.
 */

import type {
  CardId,
  CardState,
  CardType,
  CorrelationId,
  DifficultyLevel,
  EventSource,
  MediaId,
  NodeId,
  RemediationCardType,
  TemplateId,
  UserId,
} from '@noema/types';
import type {
  IExecutionContext,
  IServiceResult,
} from '../../src/domain/content-service/content.service.js';
import type {
  IBatchCreateResult,
  ICard,
  ICardContent,
  ICardSummary,
  IChangeCardStateInput,
  ICreateCardInput,
  ICreateMediaInput,
  ICreateTemplateInput,
  IDeckQuery,
  IMediaFile,
  IPresignedDownloadUrl,
  IPresignedUploadUrl,
  ITemplate,
  ITemplateSummary,
  IUpdateCardInput,
} from '../../src/types/content.types.js';

// ============================================================================
// ID Generators
// ============================================================================

let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter++;
  return `${prefix}${'a'.repeat(21 - String(idCounter).length)}${idCounter}`;
}

export function cardId(): CardId {
  return nextId('card_') as CardId;
}

export function userId(): UserId {
  return nextId('user_') as UserId;
}

export function templateId(): TemplateId {
  return nextId('tmpl_') as TemplateId;
}

export function mediaId(): MediaId {
  return nextId('media') as MediaId;
}

export function nodeId(): NodeId {
  return nextId('node_') as NodeId;
}

export function correlationId(): CorrelationId {
  return `cor_${Date.now().toString(36)}` as CorrelationId;
}

export function resetIdCounter(): void {
  idCounter = 0;
}

// ============================================================================
// Content Factories
// ============================================================================

export function atomicContent(overrides: Partial<ICardContent> = {}): ICardContent {
  return {
    front: 'What is the capital of France?',
    back: 'Paris',
    hint: 'It starts with P',
    explanation: 'Paris has been the capital since the 10th century.',
    ...overrides,
  } as ICardContent;
}

export function clozeContent(overrides: Partial<ICardContent> = {}): ICardContent {
  return {
    front: 'Complete the sentence.',
    back: 'The capital of France is Paris.',
    template: 'The capital of France is {{c1::Paris}}.',
    clozes: [{ text: 'Paris', answer: 'Paris', position: 0 }],
    ...overrides,
  } as ICardContent;
}

export function multipleChoiceContent(overrides: Partial<ICardContent> = {}): ICardContent {
  return {
    front: 'What is 2 + 2?',
    back: '4',
    choices: [
      { text: '3', correct: false, feedback: 'Too low' },
      { text: '4', correct: true, feedback: 'Correct!' },
      { text: '5', correct: false, feedback: 'Too high' },
    ],
    ...overrides,
  } as ICardContent;
}

export function trueFalseContent(overrides: Partial<ICardContent> = {}): ICardContent {
  return {
    front: 'Is the sky blue?',
    back: 'True',
    statement: 'The sky appears blue due to Rayleigh scattering.',
    isTrue: true,
    ...overrides,
  } as ICardContent;
}

// ============================================================================
// Card Factories
// ============================================================================

export function createCardInput(overrides: Partial<ICreateCardInput> = {}): ICreateCardInput {
  return {
    cardType: 'atomic' as CardType,
    content: atomicContent(),
    difficulty: 'intermediate' as DifficultyLevel,
    knowledgeNodeIds: [],
    tags: [],
    source: 'user' as EventSource,
    metadata: {},
    ...overrides,
  };
}

export function card(overrides: Partial<ICard> = {}): ICard {
  const id = overrides.id ?? cardId();
  const uid = overrides.userId ?? userId();
  return {
    id,
    userId: uid,
    cardType: 'atomic' as CardType,
    state: 'draft' as CardState,
    difficulty: 'intermediate' as DifficultyLevel,
    content: atomicContent(),
    knowledgeNodeIds: [],
    tags: [],
    source: 'user' as EventSource,
    metadata: {},
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    deletedAt: null,
    createdBy: uid,
    updatedBy: '',
    version: 1,
    ...overrides,
  };
}

export function cardSummary(overrides: Partial<ICardSummary> = {}): ICardSummary {
  return {
    id: overrides.id ?? cardId(),
    userId: overrides.userId ?? userId(),
    cardType: 'atomic' as CardType,
    state: 'draft' as CardState,
    difficulty: 'intermediate' as DifficultyLevel,
    preview: 'What is the capital of France?',
    knowledgeNodeIds: [],
    tags: [],
    source: 'user' as EventSource,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

export function updateCardInput(overrides: Partial<IUpdateCardInput> = {}): IUpdateCardInput {
  return {
    content: atomicContent({ front: 'Updated question?', back: 'Updated answer' }),
    ...overrides,
  };
}

// ============================================================================
// Template Factories
// ============================================================================

export function template(overrides: Partial<ITemplate> = {}): ITemplate {
  const id = overrides.id ?? templateId();
  const uid = overrides.userId ?? userId();
  return {
    id,
    userId: uid,
    name: 'Basic Q&A Template',
    description: 'A basic question and answer template',
    cardType: 'atomic' as CardType,
    content: atomicContent(),
    difficulty: 'intermediate' as DifficultyLevel,
    knowledgeNodeIds: [],
    tags: [],
    metadata: {},
    visibility: 'private',
    usageCount: 0,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    deletedAt: null,
    createdBy: uid,
    updatedBy: '',
    version: 1,
    ...overrides,
  };
}

export function createTemplateInput(
  overrides: Partial<ICreateTemplateInput> = {}
): ICreateTemplateInput {
  return {
    name: 'Basic Q&A Template',
    description: 'A basic question and answer template',
    cardType: 'atomic' as CardType,
    content: atomicContent(),
    difficulty: 'intermediate' as DifficultyLevel,
    knowledgeNodeIds: [],
    tags: [],
    metadata: {},
    visibility: 'private',
    ...overrides,
  };
}

// ============================================================================
// Media Factories
// ============================================================================

export function mediaFile(overrides: Partial<IMediaFile> = {}): IMediaFile {
  const id = overrides.id ?? mediaId();
  return {
    id,
    userId: overrides.userId ?? userId(),
    filename: `${id}.png`,
    originalFilename: 'photo.png',
    mimeType: 'image/png',
    sizeBytes: 12345,
    bucket: 'content',
    objectKey: `user_1/${id}.png`,
    alt: null,
    metadata: {},
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

// ============================================================================
// Context Factories
// ============================================================================

export function executionContext(overrides: Partial<IExecutionContext> = {}): IExecutionContext {
  return {
    userId: overrides.userId ?? userId(),
    correlationId: correlationId(),
    roles: ['user'],
    ...overrides,
  };
}

export function adminContext(overrides: Partial<IExecutionContext> = {}): IExecutionContext {
  return executionContext({
    roles: ['admin'],
    ...overrides,
  });
}

export function unauthenticatedContext(): IExecutionContext {
  return {
    userId: null,
    correlationId: correlationId(),
    roles: [],
  };
}
