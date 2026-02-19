/**
 * Public Routes Layout
 */

'use client';

import { GuestGuard } from '@noema/auth';
import { useRouter } from 'next/navigation';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <GuestGuard
      onAuthenticated={() => {
        router.push('/dashboard');
      }}
    >
      {children}
    </GuestGuard>
  );
}
