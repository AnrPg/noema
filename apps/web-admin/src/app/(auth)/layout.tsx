/**
 * Admin Auth Layout
 */

import { GuestGuard } from '@noema/auth';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <GuestGuard redirectTo="/dashboard">{children}</GuestGuard>;
}
