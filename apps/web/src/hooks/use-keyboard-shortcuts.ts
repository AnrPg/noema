/**
 * Keyboard Shortcut System
 *
 * useKeyboardShortcuts() registers page-scoped shortcuts. Shortcuts do not
 * fire when focus is in an input field unless ignoreInputs is set.
 *
 * Pressing Shift+? opens a reference panel listing all active shortcuts.
 */

'use client';

import { useEffect, useRef } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface IShortcutDef {
  /** The key to listen for (e.g. 'k', 'ArrowDown', 'Enter') */
  key: string;
  /** Optional modifier key */
  mod?: 'cmd' | 'ctrl' | 'shift' | 'alt';
  /** Whether to fire in input fields (default: false) */
  ignoreInputs?: boolean;
  /** Human-readable label for the reference panel */
  label: string;
  /** Handler to call when shortcut fires */
  handler: () => void;
  /** Optional condition — shortcut only fires when this returns true */
  when?: () => boolean;
}

// ============================================================================
// Platform detection
// ============================================================================

// Cached once at module load time — platform does not change at runtime.
const _isMac: boolean = typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent);

function modPressed(e: KeyboardEvent, mod: IShortcutDef['mod']): boolean {
  if (mod === undefined) return true;
  switch (mod) {
    case 'cmd':
      return _isMac ? e.metaKey : e.ctrlKey;
    case 'ctrl':
      return e.ctrlKey;
    case 'shift':
      return e.shiftKey;
    case 'alt':
      return e.altKey;
    default:
      return false;
  }
}

export function isInputFocused(): boolean {
  const el = document.activeElement;
  if (el === null) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return false;
}

// ============================================================================
// Global shortcut registry (module-level for the reference panel)
// Registry stores refs so getRegisteredShortcuts() always returns live values.
// ============================================================================

const _registry = new Map<string, { current: IShortcutDef[] }>();

export function getRegisteredShortcuts(): IShortcutDef[] {
  return [..._registry.values()].flatMap((r) => r.current);
}

// ============================================================================
// Hook
// ============================================================================

let _idCounter = 0;

export function useKeyboardShortcuts(shortcuts: IShortcutDef[]): void {
  // Keep a stable ref so the keydown handler always calls the latest shortcuts
  // without needing to re-register the listener on every render.
  const ref = useRef(shortcuts);

  useEffect(() => {
    ref.current = shortcuts;
  }, [shortcuts]);

  useEffect(() => {
    const id = String(++_idCounter);
    _registry.set(id, ref); // store ref — getRegisteredShortcuts() reads .current

    const handler = (e: KeyboardEvent): void => {
      for (const shortcut of ref.current) {
        if (e.key !== shortcut.key) continue;
        if (!modPressed(e, shortcut.mod)) continue;
        if (!(shortcut.ignoreInputs === true) && isInputFocused()) continue;
        if (shortcut.when !== undefined && !shortcut.when()) continue;
        e.preventDefault();
        shortcut.handler();
        break;
      }
    };

    window.addEventListener('keydown', handler);

    return () => {
      window.removeEventListener('keydown', handler);
      _registry.delete(id);
    };
  }, []); // handler reads through ref; effect runs once per mount
}
