/**
 * @noema/knowledge-graph-service — CKG Typestate Machine Unit Tests
 *
 * Exhaustive tests for the mutation pipeline's state machine:
 * - Valid state transitions (happy path and rejection branches)
 * - Invalid transitions (from terminal states, skip-ahead attempts)
 * - Terminal state detection
 * - Cancellable state detection
 * - validateTransition() throwing behavior
 * - getNextHappyPathState() progression
 */

import { describe, expect, it } from 'vitest';

import {
  CANCELLABLE_STATES,
  getAllowedTransitions,
  getNextHappyPathState,
  isCancellableState,
  isTerminalState,
  isValidTransition,
  STATE_TRANSITIONS,
  TERMINAL_STATES,
  validateTransition,
} from '../../../src/domain/knowledge-graph-service/ckg-typestate.js';

import type { MutationState } from '@noema/types';

// ============================================================================
// All States (for exhaustive iteration)
// ============================================================================

const ALL_STATES: readonly MutationState[] = [
  'proposed',
  'validating',
  'validated',
  'proving',
  'proven',
  'committing',
  'committed',
  'rejected',
  'pending_review',
  'revision_requested',
] as const;

// ============================================================================
// STATE_TRANSITIONS Table
// ============================================================================

describe('STATE_TRANSITIONS', () => {
  it('defines transitions for all 10 states', () => {
    expect(Object.keys(STATE_TRANSITIONS)).toHaveLength(10);
    for (const state of ALL_STATES) {
      expect(STATE_TRANSITIONS[state]).toBeDefined();
    }
  });

  it('is frozen', () => {
    expect(Object.isFrozen(STATE_TRANSITIONS)).toBe(true);
  });

  it('terminal states have no transitions', () => {
    expect(STATE_TRANSITIONS.committed).toHaveLength(0);
    expect(STATE_TRANSITIONS.rejected).toHaveLength(0);
  });
});

// ============================================================================
// Valid Transitions (Happy Path)
// ============================================================================

describe('Valid transitions — happy path', () => {
  const HAPPY_PATH: [MutationState, MutationState][] = [
    ['proposed', 'validating'],
    ['validating', 'validated'],
    ['validated', 'proving'],
    ['proving', 'proven'],
    ['proven', 'committing'],
    ['committing', 'committed'],
  ];

  it.each(HAPPY_PATH)('%s → %s is valid', (from, to) => {
    expect(isValidTransition(from, to)).toBe(true);
  });
});

// ============================================================================
// Valid Transitions — Rejection Branches
// ============================================================================

describe('Valid transitions — rejection branches', () => {
  const REJECTION_TRANSITIONS: [MutationState, MutationState][] = [
    ['proposed', 'rejected'],
    ['validating', 'rejected'],
    ['validated', 'rejected'],
    ['proving', 'rejected'],
    ['proven', 'rejected'],
    ['committing', 'rejected'],
  ];

  it.each(REJECTION_TRANSITIONS)('%s → rejected is valid', (from, to) => {
    expect(isValidTransition(from, to)).toBe(true);
  });
});

// ============================================================================
// Valid Transitions — Escalation Branch
// ============================================================================

describe('Valid transitions — escalation', () => {
  it('validating → pending_review is valid', () => {
    expect(isValidTransition('validating', 'pending_review')).toBe(true);
  });

  it('pending_review → validated is valid', () => {
    expect(isValidTransition('pending_review', 'validated')).toBe(true);
  });

  it('pending_review → rejected is valid', () => {
    expect(isValidTransition('pending_review', 'rejected')).toBe(true);
  });

  it('pending_review → revision_requested is valid', () => {
    expect(isValidTransition('pending_review', 'revision_requested')).toBe(true);
  });

  it('revision_requested → proposed is valid', () => {
    expect(isValidTransition('revision_requested', 'proposed')).toBe(true);
  });
});

// ============================================================================
// Invalid Transitions
// ============================================================================

describe('Invalid transitions', () => {
  it('cannot skip from proposed directly to committed', () => {
    expect(isValidTransition('proposed', 'committed')).toBe(false);
  });

  it('cannot skip from proposed directly to validated', () => {
    expect(isValidTransition('proposed', 'validated')).toBe(false);
  });

  it('cannot go backwards: validating → proposed', () => {
    expect(isValidTransition('validating', 'proposed')).toBe(false);
  });

  it('cannot go backwards: committed → committing', () => {
    expect(isValidTransition('committed', 'committing')).toBe(false);
  });

  it('committed cannot transition to anything', () => {
    for (const state of ALL_STATES) {
      expect(isValidTransition('committed', state)).toBe(false);
    }
  });

  it('rejected cannot transition to anything', () => {
    for (const state of ALL_STATES) {
      expect(isValidTransition('rejected', state)).toBe(false);
    }
  });

  it('cannot go from validated directly to committed (must go through proving)', () => {
    expect(isValidTransition('validated', 'committed')).toBe(false);
  });

  it('cannot go from proposed to pending_review (must go through validating first)', () => {
    expect(isValidTransition('proposed', 'pending_review')).toBe(false);
  });
});

// ============================================================================
// getAllowedTransitions()
// ============================================================================

describe('getAllowedTransitions()', () => {
  it('proposed: [validating, rejected]', () => {
    expect(getAllowedTransitions('proposed')).toEqual(['validating', 'rejected']);
  });

  it('validating: [validated, pending_review, rejected]', () => {
    expect(getAllowedTransitions('validating')).toEqual([
      'validated',
      'pending_review',
      'rejected',
    ]);
  });

  it('committed: [] (no transitions)', () => {
    expect(getAllowedTransitions('committed')).toEqual([]);
  });

  it('rejected: [] (no transitions)', () => {
    expect(getAllowedTransitions('rejected')).toEqual([]);
  });

  it('pending_review: [validated, revision_requested, rejected]', () => {
    expect(getAllowedTransitions('pending_review')).toEqual([
      'validated',
      'revision_requested',
      'rejected',
    ]);
  });
});

// ============================================================================
// Terminal States
// ============================================================================

describe('Terminal states', () => {
  it('TERMINAL_STATES contains committed and rejected', () => {
    expect(TERMINAL_STATES.has('committed')).toBe(true);
    expect(TERMINAL_STATES.has('rejected')).toBe(true);
  });

  it('TERMINAL_STATES has exactly 2 entries', () => {
    expect(TERMINAL_STATES.size).toBe(2);
  });

  it('isTerminalState() returns true for committed', () => {
    expect(isTerminalState('committed')).toBe(true);
  });

  it('isTerminalState() returns true for rejected', () => {
    expect(isTerminalState('rejected')).toBe(true);
  });

  it('isTerminalState() returns false for non-terminal states', () => {
    const nonTerminal: MutationState[] = [
      'proposed',
      'validating',
      'validated',
      'proving',
      'proven',
      'committing',
      'pending_review',
    ];
    for (const state of nonTerminal) {
      expect(isTerminalState(state)).toBe(false);
    }
  });
});

// ============================================================================
// Cancellable States
// ============================================================================

describe('Cancellable states', () => {
  it('CANCELLABLE_STATES contains proposed, validating, pending_review, revision_requested', () => {
    expect(CANCELLABLE_STATES.has('proposed')).toBe(true);
    expect(CANCELLABLE_STATES.has('validating')).toBe(true);
    expect(CANCELLABLE_STATES.has('pending_review')).toBe(true);
    expect(CANCELLABLE_STATES.has('revision_requested')).toBe(true);
  });

  it('CANCELLABLE_STATES has exactly 4 entries', () => {
    expect(CANCELLABLE_STATES.size).toBe(4);
  });

  it('isCancellableState() returns true for early-stage states', () => {
    expect(isCancellableState('proposed')).toBe(true);
    expect(isCancellableState('validating')).toBe(true);
    expect(isCancellableState('pending_review')).toBe(true);
    expect(isCancellableState('revision_requested')).toBe(true);
  });

  it('isCancellableState() returns false for late-stage states', () => {
    expect(isCancellableState('validated')).toBe(false);
    expect(isCancellableState('proving')).toBe(false);
    expect(isCancellableState('proven')).toBe(false);
    expect(isCancellableState('committing')).toBe(false);
  });

  it('isCancellableState() returns false for terminal states', () => {
    expect(isCancellableState('committed')).toBe(false);
    expect(isCancellableState('rejected')).toBe(false);
  });
});

// ============================================================================
// validateTransition() — Throwing API
// ============================================================================

describe('validateTransition()', () => {
  it('does not throw for valid transitions', () => {
    expect(() => {
      validateTransition('proposed', 'validating');
    }).not.toThrow();
    expect(() => {
      validateTransition('validating', 'validated');
    }).not.toThrow();
  });

  it('throws for invalid transitions', () => {
    expect(() => {
      validateTransition('proposed', 'committed');
    }).toThrow(/Invalid state transition/);
  });

  it('throws with descriptive message including allowed states', () => {
    expect(() => {
      validateTransition('proposed', 'committed');
    }).toThrow(/Allowed: \[validating, rejected\]/);
  });

  it('throws for terminal-to-anything transition', () => {
    expect(() => {
      validateTransition('committed', 'proposed');
    }).toThrow(/Invalid state transition/);
  });
});

// ============================================================================
// getNextHappyPathState()
// ============================================================================

describe('getNextHappyPathState()', () => {
  it('proposed → validating', () => {
    expect(getNextHappyPathState('proposed')).toBe('validating');
  });

  it('validating → validated', () => {
    expect(getNextHappyPathState('validating')).toBe('validated');
  });

  it('validated → proving', () => {
    expect(getNextHappyPathState('validated')).toBe('proving');
  });

  it('proving → proven', () => {
    expect(getNextHappyPathState('proving')).toBe('proven');
  });

  it('proven → committing', () => {
    expect(getNextHappyPathState('proven')).toBe('committing');
  });

  it('committing → committed', () => {
    expect(getNextHappyPathState('committing')).toBe('committed');
  });

  it('committed → null (terminal)', () => {
    expect(getNextHappyPathState('committed')).toBeNull();
  });

  it('rejected → null (terminal)', () => {
    expect(getNextHappyPathState('rejected')).toBeNull();
  });

  it('pending_review → validated (first non-rejected)', () => {
    expect(getNextHappyPathState('pending_review')).toBe('validated');
  });
});

// ============================================================================
// Full Happy Path Walk
// ============================================================================

describe('Full happy path walk', () => {
  it('walks proposed → committed in 6 transitions', () => {
    const path: MutationState[] = ['proposed'];
    let current: MutationState = 'proposed';

    while (!isTerminalState(current)) {
      const next = getNextHappyPathState(current);
      if (next === null) break;
      expect(isValidTransition(current, next)).toBe(true);
      path.push(next);
      current = next;
    }

    expect(path).toEqual([
      'proposed',
      'validating',
      'validated',
      'proving',
      'proven',
      'committing',
      'committed',
    ]);
  });
});
