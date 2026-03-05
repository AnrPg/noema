import React from 'react';
import { render, screen } from '@testing-library/react';
import AuthenticatedLayout from './layout.js';

vi.mock('@noema/auth', () => ({
  useAuth: () => ({
    user: { id: 'u1', displayName: 'Test', email: 't@t.com', avatarUrl: null },
    logout: vi.fn(),
  }),
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/cards',
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/components/command-palette', () => ({ CommandPalette: () => null }));
vi.mock('@/components/session-expiry-modal', () => ({ SessionExpiryModal: () => null }));
vi.mock('@/components/shortcut-reference-panel', () => ({ ShortcutReferencePanel: () => null }));

test('Card Library nav item is present', () => {
  render(
    <AuthenticatedLayout>
      <div />
    </AuthenticatedLayout>
  );
  expect(screen.getByRole('link', { name: /card library/i })).toBeInTheDocument();
});

test('Card Library nav item links to /cards', () => {
  render(
    <AuthenticatedLayout>
      <div />
    </AuthenticatedLayout>
  );
  expect(screen.getByRole('link', { name: /card library/i })).toHaveAttribute('href', '/cards');
});
