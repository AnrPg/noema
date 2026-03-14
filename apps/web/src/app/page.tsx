/**
 * Home Page - Redirect to dashboard
 *
 * Authenticated users land on the dashboard directly.
 * Unauthenticated users are redirected to /login by the AuthGuard
 * in the (authenticated) layout.
 */

import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/dashboard');
}
