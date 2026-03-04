import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { ThemeProvider, useTheme } from './theme.js';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock document.documentElement.classList
const classListMock = {
  _classes: new Set<string>(),
  add: vi.fn((c: string) => {
    classListMock._classes.add(c);
  }),
  remove: vi.fn((...args: string[]) => {
    args.forEach((c) => classListMock._classes.delete(c));
  }),
  contains: (c: string) => classListMock._classes.has(c),
};
Object.defineProperty(document, 'documentElement', {
  value: { classList: classListMock },
  writable: true,
});

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(ThemeProvider, { defaultTheme: 'dark' }, children);

describe('useTheme', () => {
  beforeEach(() => {
    localStorageMock.clear();
    classListMock._classes.clear();
    classListMock.add.mockClear();
    classListMock.remove.mockClear();
  });

  it('defaults to dark theme', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe('dark');
    expect(result.current.resolvedTheme).toBe('dark');
  });

  it('setTheme updates theme and localStorage', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => {
      result.current.setTheme('light');
    });
    expect(result.current.theme).toBe('light');
    expect(localStorageMock.getItem('noema-theme')).toBe('light');
  });

  it('setTheme adds correct class to html element', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => {
      result.current.setTheme('light');
    });
    expect(classListMock.remove).toHaveBeenCalledWith('dark', 'light');
    expect(classListMock.add).toHaveBeenCalledWith('light');
  });

  it('toggleTheme switches between dark and light', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe('light');
    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe('dark');
  });

  it('serverTheme is ignored when localStorage has a value', () => {
    localStorageMock.setItem('noema-theme', 'light');
    const wrapperWithServer = ({ children }: { children: React.ReactNode }) =>
      React.createElement(ThemeProvider, { serverTheme: 'dark', defaultTheme: 'dark' }, children);
    const { result } = renderHook(() => useTheme(), { wrapper: wrapperWithServer });
    expect(result.current.theme).toBe('light');
  });
});
