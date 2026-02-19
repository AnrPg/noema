/**
 * Admin Home - Redirect to login or dashboard
 */

import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/login');
}
