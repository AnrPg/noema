/**
 * @noema/content-service — Agent Content Hints Unit Tests
 *
 * Tests hint generators for state transitions and quality signals.
 */

import { describe, expect, it } from 'vitest';
import {
  generateQualityHints,
  generateStateTransitionHints,
} from '../../../src/agents/hints/content.hints.js';

// ============================================================================
// generateStateTransitionHints
// ============================================================================

describe('generateStateTransitionHints', () => {
  it('returns activation hint for draft → active', () => {
    const hints = generateStateTransitionHints('draft', 'active', 'ATOMIC');
    expect(hints).toHaveLength(1);
    expect(hints[0]!.type).toBe('activation');
    expect(hints[0]!.priority).toBe('low');
  });

  it('returns suspension hint when transitioning to suspended', () => {
    const hints = generateStateTransitionHints('active', 'suspended', 'CLOZE');
    expect(hints).toHaveLength(1);
    expect(hints[0]!.type).toBe('suspension');
    expect(hints[0]!.priority).toBe('medium');
  });

  it('returns archival hint when transitioning to archived', () => {
    const hints = generateStateTransitionHints('active', 'archived', 'ATOMIC');
    expect(hints).toHaveLength(1);
    expect(hints[0]!.type).toBe('archival');
    expect(hints[0]!.priority).toBe('low');
  });

  it('returns no hints for unrecognized transitions', () => {
    const hints = generateStateTransitionHints('active', 'draft', 'ATOMIC');
    expect(hints).toHaveLength(0);
  });

  it('returns suspension hint regardless of source state', () => {
    const fromDraft = generateStateTransitionHints('draft', 'suspended', 'ATOMIC');
    const fromActive = generateStateTransitionHints('active', 'suspended', 'CLOZE');
    expect(fromDraft).toHaveLength(1);
    expect(fromActive).toHaveLength(1);
    expect(fromDraft[0]!.type).toBe('suspension');
    expect(fromActive[0]!.type).toBe('suspension');
  });
});

// ============================================================================
// generateQualityHints
// ============================================================================

describe('generateQualityHints', () => {
  it('returns missing_tags hint when tags are empty', () => {
    const hints = generateQualityHints({
      content: {},
      tags: [],
      knowledgeNodeIds: ['node_1'],
    });
    expect(hints).toHaveLength(1);
    expect(hints[0]!.type).toBe('missing_tags');
    expect(hints[0]!.priority).toBe('medium');
  });

  it('returns unlinked hint when knowledgeNodeIds are empty', () => {
    const hints = generateQualityHints({
      content: {},
      tags: ['math'],
      knowledgeNodeIds: [],
    });
    expect(hints).toHaveLength(1);
    expect(hints[0]!.type).toBe('unlinked');
    expect(hints[0]!.priority).toBe('high');
  });

  it('returns both hints when tags and nodes are missing', () => {
    const hints = generateQualityHints({
      content: {},
      tags: [],
      knowledgeNodeIds: [],
    });
    expect(hints).toHaveLength(2);
    const types = hints.map((h) => h.type);
    expect(types).toContain('missing_tags');
    expect(types).toContain('unlinked');
  });

  it('returns no hints when card has tags and nodes', () => {
    const hints = generateQualityHints({
      content: { question: 'What is 2+2?', answer: '4' },
      tags: ['math', 'arithmetic'],
      knowledgeNodeIds: ['node_1'],
    });
    expect(hints).toHaveLength(0);
  });
});
