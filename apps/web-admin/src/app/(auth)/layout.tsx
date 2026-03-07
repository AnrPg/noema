/**
 * Admin Auth Layout
 */

import type { JSX, ReactNode } from 'react';
import { GuestGuard } from '@noema/auth';

export default function AuthLayout({ children }: { children: ReactNode }): JSX.Element {
  return <GuestGuard redirectTo="/dashboard">{children}</GuestGuard>;
}
