/**
 * Toast Provider
 *
 * Renders active toasts in the bottom-right corner using @noema/ui
 * Toast primitives. Mount once at the app root (inside Providers).
 */

'use client';

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider as RadixToastProvider,
  ToastViewport,
} from '@noema/ui';
import { useToastList, type ToastVariant } from '@/hooks/use-toast';

// Variant → Radix variant mapping.
// @noema/ui Toast only supports 'default' | 'destructive' | 'success'.
// 'warning' maps to 'default' until a dedicated variant is added to @noema/ui.
const VARIANT_MAP: Record<ToastVariant, 'default' | 'destructive' | 'success'> = {
  success: 'success',
  error: 'destructive',
  info: 'default',
  warning: 'default', // TODO: add 'warning' variant to @noema/ui Toast
};

function ToastList(): React.JSX.Element {
  const { toasts, dismiss } = useToastList();

  return (
    <>
      {toasts.map((item) => (
        <Toast
          key={item.id}
          variant={VARIANT_MAP[item.variant]}
          duration={item.durationMs}
          onOpenChange={(open) => {
            if (!open) dismiss(item.id);
          }}
        >
          <ToastDescription>{item.message}</ToastDescription>
          <ToastClose />
        </Toast>
      ))}
    </>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <RadixToastProvider>
      {children}
      <ToastList />
      <ToastViewport className="fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:max-w-[420px]" />
    </RadixToastProvider>
  );
}
