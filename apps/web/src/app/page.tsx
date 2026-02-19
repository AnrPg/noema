/**
 * Home Page - Redirect based on auth state
 */

import { redirect } from 'next/navigation';

export default function HomePage() {
  // For now, redirect to login
  // In the future, this could be a landing page
  redirect('/login');
}
