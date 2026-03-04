/**
 * Public Routes Layout
 */

'use client';

import { GuestGuard } from '@noema/auth';
import { useRouter, useSearchParams } from 'next/navigation';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <GuestGuard
      onAuthenticated={() => {
        const redirect = searchParams.get('redirect');
        router.push((redirect !== null && redirect !== '' ? redirect : '/dashboard') as never);
      }}
    >
      {children}
    </GuestGuard>
  );
}
