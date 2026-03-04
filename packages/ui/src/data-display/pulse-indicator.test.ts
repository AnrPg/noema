import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, it, expect } from 'vitest';
import { PulseIndicator } from './pulse-indicator.js';

describe('PulseIndicator — status → color mapping', () => {
  it('active → bg-neuron-400', () => {
    const { container } = render(React.createElement(PulseIndicator, { status: 'active' }));
    expect(container.querySelector('.bg-neuron-400')).not.toBeNull();
  });

  it('idle → bg-axon-400', () => {
    const { container } = render(React.createElement(PulseIndicator, { status: 'idle' }));
    expect(container.querySelector('.bg-axon-400')).not.toBeNull();
  });

  it('error → bg-cortex-400', () => {
    const { container } = render(React.createElement(PulseIndicator, { status: 'error' }));
    expect(container.querySelector('.bg-cortex-400')).not.toBeNull();
  });

  it('offline → bg-axon-200', () => {
    const { container } = render(React.createElement(PulseIndicator, { status: 'offline' }));
    expect(container.querySelector('.bg-axon-200')).not.toBeNull();
  });
});

describe('PulseIndicator — active animation', () => {
  it('adds animate-pulse-glow to active dot', () => {
    const { container } = render(React.createElement(PulseIndicator, { status: 'active' }));
    expect(container.querySelector('.animate-pulse-glow')).not.toBeNull();
  });

  it('does not add animate-pulse-glow to idle dot', () => {
    const { container } = render(React.createElement(PulseIndicator, { status: 'idle' }));
    expect(container.querySelector('.animate-pulse-glow')).toBeNull();
  });
});

describe('PulseIndicator — label', () => {
  it('renders optional label text', () => {
    render(
      React.createElement(PulseIndicator, {
        status: 'active',
        label: 'Live session',
      })
    );
    expect(screen.getByText('Live session')).toBeTruthy();
  });

  it('renders without label by default', () => {
    const { container } = render(React.createElement(PulseIndicator, { status: 'idle' }));
    expect(container.querySelector('span + span')).toBeNull();
  });
});
