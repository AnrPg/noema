import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { ConfidenceMeter } from './confidence-meter.js';

describe('ConfidenceMeter — segment calculation', () => {
  it('fills 3 of 5 segments at value 0.6', () => {
    render(React.createElement(ConfidenceMeter, { value: 0.6, segments: 5 }));
    const all = screen.getAllByTestId('cm-segment');
    const filled = all.filter((el) => el.dataset.filled === 'true');
    expect(filled).toHaveLength(3);
  });

  it('fills 0 segments at value 0', () => {
    render(React.createElement(ConfidenceMeter, { value: 0, segments: 5 }));
    const filled = screen.getAllByTestId('cm-segment').filter((el) => el.dataset.filled === 'true');
    expect(filled).toHaveLength(0);
  });

  it('fills all segments at value 1', () => {
    render(React.createElement(ConfidenceMeter, { value: 1, segments: 5 }));
    const filled = screen.getAllByTestId('cm-segment').filter((el) => el.dataset.filled === 'true');
    expect(filled).toHaveLength(5);
  });

  it('renders custom segment count', () => {
    render(React.createElement(ConfidenceMeter, { value: 0.5, segments: 10 }));
    expect(screen.getAllByTestId('cm-segment')).toHaveLength(10);
  });
});

describe('ConfidenceMeter — value clamping', () => {
  it('clamps value above 1', () => {
    render(React.createElement(ConfidenceMeter, { value: 2, segments: 5 }));
    const filled = screen.getAllByTestId('cm-segment').filter((el) => el.dataset.filled === 'true');
    expect(filled).toHaveLength(5);
  });

  it('clamps value below 0', () => {
    render(React.createElement(ConfidenceMeter, { value: -1, segments: 5 }));
    const filled = screen.getAllByTestId('cm-segment').filter((el) => el.dataset.filled === 'true');
    expect(filled).toHaveLength(0);
  });
});

describe('ConfidenceMeter — controlled / uncontrolled mode', () => {
  it('renders a slider in controlled (interactive) mode', () => {
    const onChange = vi.fn();
    render(React.createElement(ConfidenceMeter, { value: 0.5, onChange }));
    expect(screen.getByRole('slider')).toBeTruthy();
  });

  it('does not render a slider in display-only mode', () => {
    render(React.createElement(ConfidenceMeter, { value: 0.5 }));
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('calls onChange with parsed float when slider changes', () => {
    const onChange = vi.fn();
    render(React.createElement(ConfidenceMeter, { value: 0.5, onChange }));
    fireEvent.change(screen.getByRole('slider'), { target: { value: '0.8' } });
    expect(onChange).toHaveBeenCalledWith(0.8);
  });
});
