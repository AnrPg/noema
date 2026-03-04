/**
 * Shortcut Reference Panel — Shift+? opens a modal listing all active shortcuts.
 */

'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getRegisteredShortcuts, type IShortcutDef } from '@/hooks/use-keyboard-shortcuts';

function formatShortcut(s: IShortcutDef): string {
  const parts: string[] = [];
  if (s.mod === 'cmd') parts.push('⌘');
  else if (s.mod === 'ctrl') parts.push('Ctrl');
  else if (s.mod === 'shift') parts.push('Shift');
  else if (s.mod === 'alt') parts.push('Alt');
  parts.push(s.key.length === 1 ? s.key.toUpperCase() : s.key);
  return parts.join('+');
}

export function ShortcutReferencePanel(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState<IShortcutDef[]>([]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === '?' && e.shiftKey && !(document.activeElement instanceof HTMLInputElement)) {
        e.preventDefault();
        setShortcuts(getRegisteredShortcuts());
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-card border border-border rounded-xl shadow-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-base font-semibold">Keyboard Shortcuts</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            All active keyboard shortcuts on the current page.
          </Dialog.Description>
          <ul className="space-y-2">
            {shortcuts.map((s, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{s.label}</span>
                <kbd className="inline-flex items-center rounded border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {formatShortcut(s)}
                </kbd>
              </li>
            ))}
            {shortcuts.length === 0 && (
              <li className="text-sm text-muted-foreground text-center py-4">
                No shortcuts registered on this page.
              </li>
            )}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
