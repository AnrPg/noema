import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, it, expect } from 'vitest';
import {
  StateChip,
  SESSION_STATE_MAP,
  CARD_STATE_MAP,
  CARD_LEARNING_STATE_MAP,
  MUTATION_STATE_MAP,
  MISCONCEPTION_STATUS_MAP,
} from './state-chip.js';

describe('StateChip', () => {
  it('renders label from SESSION_STATE_MAP for ACTIVE', () => {
    render(
      React.createElement(StateChip, {
        state: 'ACTIVE',
        stateMap: SESSION_STATE_MAP,
      })
    );
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('renders all 5 SESSION states', () => {
    const expected: Record<string, string> = {
      ACTIVE: 'Active',
      PAUSED: 'Paused',
      COMPLETED: 'Completed',
      ABANDONED: 'Abandoned',
      EXPIRED: 'Expired',
    };
    Object.entries(expected).forEach(([state, label]) => {
      const { unmount } = render(
        React.createElement(StateChip, { state, stateMap: SESSION_STATE_MAP })
      );
      expect(screen.getByText(label)).toBeTruthy();
      unmount();
    });
  });

  it('falls back to raw state string for unknown state', () => {
    render(
      React.createElement(StateChip, {
        state: 'TOTALLY_UNKNOWN',
        stateMap: SESSION_STATE_MAP,
      })
    );
    expect(screen.getByText('TOTALLY_UNKNOWN')).toBeTruthy();
  });

  it('renders CARD states', () => {
    const expected: Record<string, string> = {
      DRAFT: 'Draft',
      ACTIVE: 'Active',
      SUSPENDED: 'Suspended',
      ARCHIVED: 'Archived',
    };
    Object.entries(expected).forEach(([state, label]) => {
      const { unmount } = render(
        React.createElement(StateChip, { state, stateMap: CARD_STATE_MAP })
      );
      expect(screen.getByText(label)).toBeTruthy();
      unmount();
    });
  });

  it('renders CARD_LEARNING states', () => {
    ['NEW', 'LEARNING', 'REVIEW', 'RELEARNING'].forEach((state) => {
      const { unmount } = render(
        React.createElement(StateChip, {
          state,
          stateMap: CARD_LEARNING_STATE_MAP,
        })
      );
      expect(screen.getByRole('status')).toBeTruthy();
      unmount();
    });
  });

  it('renders MUTATION and MISCONCEPTION states without crashing', () => {
    render(
      React.createElement(StateChip, {
        state: 'PENDING',
        stateMap: MUTATION_STATE_MAP,
      })
    );
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('renders MISCONCEPTION DETECTED state', () => {
    render(
      React.createElement(StateChip, {
        state: 'DETECTED',
        stateMap: MISCONCEPTION_STATUS_MAP,
      })
    );
    expect(screen.getByText('Detected')).toBeTruthy();
  });
});
