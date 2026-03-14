# Phase 04 — Authentication & Onboarding Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Polish the auth flow with visual refinement (neuroscience palette), deep-link redirect preservation, a session-expiry modal, and fully-fleshed profile + settings pages.

**Architecture:** Additive-only changes on top of the existing login/register/forgot-password scaffold. Session expiry signal is added to the Zustand auth store so any component can react without prop drilling. Redirect state is URL-query-based (`?redirect=`) — no session storage — keeping it stateless and shareable.

**Tech Stack:** Next.js 15, TypeScript, React Hook Form + Zod, TanStack Query, Zustand (`@noema/auth`), `@noema/api-client` hooks (`useMe`, `useUpdateProfile`, `useMySettings`, `useUpdateSettings`), `@noema/ui` (`AuthLayout`, `AuthHeader`, `useTheme`, Dialog, Toast)

---

## Key Context

### Existing files (read before touching)
| File | Current state |
|------|---------------|
| `apps/web/src/app/(public)/login/page.tsx` | Login form; hard-codes `router.push('/dashboard')` — no redirect |
| `apps/web/src/app/(public)/register/page.tsx` | 3-step wizard; hard-codes `router.push('/dashboard')` — no redirect |
| `apps/web/src/app/(public)/forgot-password/page.tsx` | Scaffold — `console.log` placeholder, no API call |
| `apps/web/src/app/(public)/layout.tsx` | `GuestGuard` with `onAuthenticated={() => router.push('/dashboard')}` |
| `apps/web/src/app/(authenticated)/layout.tsx` | `AuthGuard` with `onUnauthenticated={() => router.push('/login')}` — no pathname |
| `apps/web/src/app/(authenticated)/profile/page.tsx` | 2-field form (displayName, bio); uses `useAuth().user` not `useMe()` |
| `apps/web/src/app/(authenticated)/settings/page.tsx` | Has ChangePasswordCard + placeholder Preferences + DeleteAccountCard |
| `apps/web/src/app/providers.tsx` | Configures api-client — **no `onUnauthorized` hook** |
| `packages/auth/src/store.ts` | Zustand store — **no `isSessionExpired` state** |
| `packages/auth/src/types.ts` | `AuthState` / `AuthStore` interfaces |
| `packages/ui/src/styles/globals.css` | Has all neuroscience palette CSS vars; **no `fade-slide-in` animation** |

### Available hooks (from `@noema/api-client`)
- `useMe()` — queries `['me']`, returns `UserDto`
- `useMySettings()` — queries `['me', 'settings']`, returns `UserSettingsDto`
- `useUpdateProfile({ data, version })` — patches display name, bio, timezone, language, country, avatarUrl
- `useUpdateSettings({ data, version })` — patches theme, notifications, dailyGoal, reminders, sound, haptic
- `useChangePassword({ data, version })` — requires `currentPassword`, `newPassword`
- `useDeleteAccount()` — no args

### Auth store session expiry signal
The `IApiClientConfig.onUnauthorized` callback fires on every HTTP 401. We wire it in `providers.tsx` to check if the user was authenticated → set `isSessionExpired = true` in the Zustand store. The modal reads this flag.

### Design tokens to use
All palette tokens are CSS custom properties (e.g. `hsl(var(--synapse-400))`). In Tailwind use arbitrary values: `text-[hsl(var(--synapse-400))]`, `bg-[hsl(var(--synapse-400)/0.1)]`, `border-[hsl(var(--axon-200))]`, `shadow-[0_0_12px_hsl(var(--synapse-400)/0.4)]`.

### Build command for `@noema/auth`
After modifying `src/store.ts` or `src/types.ts`, rebuild the package:
```bash
pnpm --filter @noema/auth build
```

---

## Task 1: Extend auth store with `isSessionExpired`

**Files:**
- Modify: `packages/auth/src/types.ts`
- Modify: `packages/auth/src/store.ts`
- Build: `pnpm --filter @noema/auth build`

**Why this task is first:** All later tasks depend on `isSessionExpired` being available in the store. The build output must be updated before Next.js can pick it up.

**Step 1: Add `isSessionExpired` to `AuthState` and `AuthStore` in `types.ts`**

In `AuthState`, add:
```typescript
isSessionExpired: boolean;
```

In `AuthStore`, add:
```typescript
setSessionExpired: (expired: boolean) => void;
```

**Step 2: Add state + action to `store.ts`**

In `initialState`, add:
```typescript
isSessionExpired: false,
```

In the store definition body, add the action:
```typescript
setSessionExpired: (expired: boolean) => {
  set({ isSessionExpired: expired });
},
```

The `reset()` action should also clear `isSessionExpired`:
```typescript
reset: () => {
  set({
    ...initialState,
    isInitialized: true,
    isLoading: false,
  });
},
```
`initialState.isSessionExpired = false` so `reset()` already clears it.

**Step 3: Rebuild the package**

```bash
pnpm --filter @noema/auth build
```
Expected: no errors, `dist/` updated.

**Step 4: Verify the exported types are correct**

```bash
grep -n "isSessionExpired\|setSessionExpired" packages/auth/dist/types.d.ts packages/auth/dist/store.d.ts
```
Expected: both symbols appear in the declarations.

**Step 5: Commit**

```bash
git add packages/auth/src/types.ts packages/auth/src/store.ts packages/auth/dist/
git commit -m "feat(auth): add isSessionExpired state + setSessionExpired action to auth store"
```

---

## Task 2: Post-Login Redirect Logic (T4.2)

**Files:**
- Modify: `apps/web/src/app/(authenticated)/layout.tsx`
- Modify: `apps/web/src/app/(public)/layout.tsx`
- Modify: `apps/web/src/app/(public)/login/page.tsx`
- Modify: `apps/web/src/app/(public)/register/page.tsx`

**Goal:** Deep link preservation. Navigating to `/knowledge/graph` while logged out → `/login?redirect=%2Fknowledge%2Fgraph` → after login → back to `/knowledge/graph`.

**Step 1: Modify authenticated layout to pass pathname in redirect**

Current code:
```tsx
<AuthGuard
  onUnauthenticated={() => {
    router.push('/login');
  }}
>
```

Replace with:
```tsx
<AuthGuard
  onUnauthenticated={() => {
    const encoded = encodeURIComponent(pathname);
    router.push(`/login?redirect=${encoded}`);
  }}
>
```

`pathname` is already available from `usePathname()` at the top of the component.

**Step 2: Modify public layout to use redirect param on authenticated redirect**

Current code in `layout.tsx`:
```tsx
<GuestGuard
  onAuthenticated={() => {
    router.push('/dashboard');
  }}
>
```

Replace with (add `useSearchParams` import):
```tsx
'use client';

import { GuestGuard } from '@noema/auth';
import { useRouter, useSearchParams } from 'next/navigation';

export default function PublicLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <GuestGuard
      onAuthenticated={() => {
        const redirect = searchParams.get('redirect');
        router.push(redirect !== null && redirect !== '' ? redirect : '/dashboard');
      }}
    >
      {children}
    </GuestGuard>
  );
}
```

**Step 3: Modify login page to consume redirect after successful login**

Add `useSearchParams` import. Change the `onSubmit` handler and add return type:

```tsx
export default function LoginPage(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  // ...

  const onSubmit = async (data: LoginFormData): Promise<void> => {
    try {
      setError(null);
      await login({ identifier: data.email, password: data.password });
      const redirect = searchParams.get('redirect');
      router.push(redirect !== null && redirect !== '' ? redirect : '/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };
```

**Step 4: Modify register page to consume redirect after successful register**

Same pattern as login. Change `onSubmit`:
```tsx
const onSubmit = async (data: RegisterFormData): Promise<void> => {
  try {
    // ...
    await registerUser({ ... });
    const redirect = searchParams.get('redirect');
    router.push(redirect !== null && redirect !== '' ? redirect : '/dashboard');
  } catch (err) { ... }
};
```

Also add `useSearchParams` to the imports and add proper return type to the function signature:
```tsx
export default function RegisterPage(): React.JSX.Element {
```

**Step 5: Run typecheck**

```bash
pnpm --filter @noema/web typecheck 2>&1 | tail -20
```
Expected: 0 errors.

**Step 6: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/layout.tsx \
        apps/web/src/app/\(public\)/layout.tsx \
        apps/web/src/app/\(public\)/login/page.tsx \
        apps/web/src/app/\(public\)/register/page.tsx
git commit -m "feat(web): add post-login deep-link redirect preservation via ?redirect= param"
```

---

## Task 3: Session Expiry Modal (T4.3)

**Files:**
- Create: `apps/web/src/components/session-expiry-modal.tsx`
- Modify: `apps/web/src/app/providers.tsx`
- Modify: `apps/web/src/app/(authenticated)/layout.tsx`

**Goal:** Non-dismissable modal when 401 + session expiry detected. Blocks UI until user clicks "Sign in again".

**Step 1: Create `session-expiry-modal.tsx`**

```tsx
/**
 * Session Expiry Modal
 *
 * Displayed when the API returns a 401 after the user was authenticated
 * (token refresh failed). Non-dismissable — user must sign in again.
 * Wired to the auth store's `isSessionExpired` flag.
 */

'use client';

import { useAuthStore } from '@noema/auth';
import { Button } from '@noema/ui';
import { LogIn } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

export function SessionExpiryModal(): React.JSX.Element | null {
  const isSessionExpired = useAuthStore((s) => s.isSessionExpired);
  const setSessionExpired = useAuthStore((s) => s.setSessionExpired);
  const reset = useAuthStore((s) => s.reset);
  const pathname = usePathname();
  const router = useRouter();

  if (!isSessionExpired) return null;

  const handleSignInAgain = (): void => {
    reset();
    setSessionExpired(false);
    const encoded = encodeURIComponent(pathname);
    router.push(`/login?redirect=${encoded}`);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-expiry-title"
    >
      <div className="mx-4 w-full max-w-sm rounded-lg border bg-card p-6 shadow-lg space-y-4">
        <div className="space-y-2 text-center">
          <div className="flex justify-center">
            <div className="rounded-full bg-[hsl(var(--synapse-400)/0.1)] p-3">
              <LogIn className="h-6 w-6 text-[hsl(var(--synapse-400))]" />
            </div>
          </div>
          <h2
            id="session-expiry-title"
            className="text-lg font-semibold"
          >
            Session expired
          </h2>
          <p className="text-sm text-muted-foreground">
            Your session has expired. Please sign in again to continue.
          </p>
        </div>
        <Button className="w-full" onClick={handleSignInAgain}>
          Sign in again
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Wire `onUnauthorized` in `providers.tsx`**

Import `useAuthStore` from `@noema/auth`.

Change `configureApiClient` call to include `onUnauthorized`:
```tsx
configureApiClient({
  baseUrl: process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:8080/api',
  getAccessToken: () => useAuthStore.getState().accessToken,
  onUnauthorized: () => {
    const state = useAuthStore.getState();
    // Only signal session expiry if the user was actively authenticated.
    // This guards against false positives during the initial auth init check.
    if (state.isInitialized && state.isAuthenticated) {
      state.setSessionExpired(true);
    }
  },
});
```

**Step 3: Render `<SessionExpiryModal />` in authenticated layout**

In `apps/web/src/app/(authenticated)/layout.tsx`, add the import and render it adjacent to `CommandPalette`:

```tsx
import { SessionExpiryModal } from '@/components/session-expiry-modal';

// Inside the AuthGuard:
<AuthGuard ...>
  <CommandPalette />
  <ShortcutReferencePanel />
  <SessionExpiryModal />
  <DashboardLayout>
    ...
  </DashboardLayout>
</AuthGuard>
```

**Step 4: Run typecheck + build**

```bash
pnpm --filter @noema/web typecheck 2>&1 | tail -20
pnpm --filter @noema/web build 2>&1 | tail -20
```
Expected: 0 errors, build succeeds.

**Step 5: Commit**

```bash
git add apps/web/src/components/session-expiry-modal.tsx \
        apps/web/src/app/providers.tsx \
        apps/web/src/app/\(authenticated\)/layout.tsx
git commit -m "feat(web): add non-dismissable session expiry modal on 401 + auth reset"
```

---

## Task 4: Auth Pages Visual Refresh (T4.1)

**Files:**
- Modify: `apps/web/src/styles/globals.css`
- Modify: `apps/web/src/app/(public)/login/page.tsx`
- Modify: `apps/web/src/app/(public)/register/page.tsx`
- Modify: `apps/web/src/app/(public)/forgot-password/page.tsx`

**Goal:** Apply neuroscience palette to auth pages; full implementation of forgot-password.

**Step 1: Add `fade-slide-in` animation to `globals.css`**

Add to `apps/web/src/styles/globals.css` (append inside `@layer utilities`):
```css
@layer utilities {
  /* ... existing shimmer ... */

  .animate-auth-card {
    animation: auth-card-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  @keyframes auth-card-in {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
}
```

Also add a neural gradient background class:
```css
@layer utilities {
  .auth-neural-bg {
    background-image:
      radial-gradient(ellipse 80% 50% at 20% 20%, hsl(var(--synapse-400) / 0.06) 0%, transparent 60%),
      radial-gradient(ellipse 60% 40% at 80% 80%, hsl(var(--dendrite-400) / 0.05) 0%, transparent 60%);
  }
}
```

**Step 2: Update login page**

Key changes:
1. Add `Brain` icon import from `lucide-react`
2. Add `logo` prop to `AuthHeader` with a Brain icon styled with synapse glow
3. Apply `animate-auth-card` to the Card
4. Add return type `React.JSX.Element`

```tsx
export default function LoginPage(): React.JSX.Element {
  // ... existing state/form ...

  return (
    <AuthLayout className="auth-neural-bg">
      <AuthHeader
        title="Welcome back"
        description="Sign in to your Noema account"
        logo={
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--synapse-400)/0.1)] shadow-[0_0_20px_hsl(var(--synapse-400)/0.3)]">
            <Brain className="h-7 w-7 text-[hsl(var(--synapse-400))]" />
          </div>
        }
      />

      <div className="animate-auth-card">
        <Card>
          {/* ... rest unchanged ... */}
        </Card>
      </div>
    </AuthLayout>
  );
}
```

**Step 3: Update register page step indicator colors**

Replace the hard-coded Tailwind classes in the step indicator buttons with palette-aware ones:

```tsx
className={`
  flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium
  transition-all duration-300
  ${
    isActive
      ? 'bg-[hsl(var(--synapse-400))] text-[hsl(var(--synapse-50))] shadow-[0_0_12px_hsl(var(--synapse-400)/0.4)]'
      : isCompleted
        ? 'bg-[hsl(var(--neuron-400)/0.15)] text-[hsl(var(--neuron-400))] cursor-pointer hover:bg-[hsl(var(--neuron-400)/0.25)]'
        : 'bg-[hsl(var(--axon-200)/0.3)] text-[hsl(var(--axon-400))]'
  }
`}
```

Also apply `animate-auth-card` to the Card and add `logo` to `AuthHeader`:
```tsx
<AuthLayout className="auth-neural-bg py-8">
  <AuthHeader
    title="Create an account"
    description="Start your personalized learning journey"
    logo={
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--synapse-400)/0.1)] shadow-[0_0_20px_hsl(var(--synapse-400)/0.3)]">
        <Brain className="h-7 w-7 text-[hsl(var(--synapse-400))]" />
      </div>
    }
  />
  {/* step indicator unchanged except color classes */}
  <div className="animate-auth-card">
    <Card>...</Card>
  </div>
</AuthLayout>
```

Add `Brain` to the `lucide-react` imports.

Also add proper return type:
```tsx
export default function RegisterPage(): React.JSX.Element {
```

**Step 4: Full implementation of forgot-password page**

Replace the entire file with a proper implementation. The password reset API endpoint does not exist yet — the page shows success state regardless (per spec):

```tsx
/**
 * Forgot Password Page
 *
 * Sends a password reset request via authApi (when endpoint is available).
 * Shows a success confirmation state after submission. Currently uses a
 * placeholder since the backend endpoint is not yet implemented.
 */

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  AlertDescription,
  AuthHeader,
  AuthLayout,
  Button,
  Card,
  CardContent,
  CardFooter,
  FormField,
  Input,
} from '@noema/ui';
import { Brain, CheckCircle, Mail } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage(): React.JSX.Element {
  const [success, setSuccess] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordFormData): Promise<void> => {
    // TODO: replace with authApi.requestPasswordReset(data.email) when endpoint exists
    // Simulate a network delay
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 800);
    });
    setSubmittedEmail(data.email);
    setSuccess(true);
  };

  if (success) {
    return (
      <AuthLayout className="auth-neural-bg">
        <AuthHeader
          title="Check your email"
          description="We've sent you a password reset link"
          logo={
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--neuron-400)/0.1)] shadow-[0_0_20px_hsl(var(--neuron-400)/0.3)]">
              <CheckCircle className="h-7 w-7 text-[hsl(var(--neuron-400))]" />
            </div>
          }
        />
        <div className="animate-auth-card">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                If an account exists for{' '}
                <span className="font-medium text-foreground">{submittedEmail}</span>, you will
                receive a password reset link shortly. Check your spam folder if you don't see it
                within a few minutes.
              </p>
            </CardContent>
            <CardFooter className="flex-col gap-3">
              <Link href="/login" className="w-full">
                <Button className="w-full">Back to sign in</Button>
              </Link>
              <button
                type="button"
                onClick={() => {
                  setSuccess(false);
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Try a different email
              </button>
            </CardFooter>
          </Card>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout className="auth-neural-bg">
      <AuthHeader
        title="Forgot password?"
        description="Enter your email and we'll send you a reset link"
        logo={
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--synapse-400)/0.1)] shadow-[0_0_20px_hsl(var(--synapse-400)/0.3)]">
            <Brain className="h-7 w-7 text-[hsl(var(--synapse-400))]" />
          </div>
        }
      />
      <div className="animate-auth-card">
        <Card>
          <form onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
            <CardContent className="space-y-4 pt-6">
              <FormField label="Email address" error={errors.email?.message} required>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  {...register('email')}
                />
              </FormField>
            </CardContent>
            <CardFooter className="flex-col gap-4">
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                <Mail className="mr-2 h-4 w-4" />
                {isSubmitting ? 'Sending...' : 'Send reset link'}
              </Button>
              <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Back to sign in
              </Link>
            </CardFooter>
          </form>
        </Card>
      </div>
    </AuthLayout>
  );
}
```

**Step 5: Run typecheck**

```bash
pnpm --filter @noema/web typecheck 2>&1 | tail -20
```
Expected: 0 errors.

**Step 6: Commit**

```bash
git add apps/web/src/styles/globals.css \
        apps/web/src/app/\(public\)/login/page.tsx \
        apps/web/src/app/\(public\)/register/page.tsx \
        apps/web/src/app/\(public\)/forgot-password/page.tsx
git commit -m "feat(web): visual refresh of auth pages with neuroscience palette and full forgot-password flow"
```

---

## Task 5: Profile Page Full Implementation (T4.4a)

**Files:**
- Modify: `apps/web/src/app/(authenticated)/profile/page.tsx`

**Goal:** Replace 2-field form with a full display/edit mode page using `useMe()` for fresh data, inline editing, and all profile fields.

**Step 1: Replace the profile page**

```tsx
/**
 * Profile Page
 *
 * Displays the current user's profile in read mode. Clicking "Edit Profile"
 * switches to an inline form. Saves via useUpdateProfile() with optimistic
 * locking — if a version conflict occurs, the user is informed via toast.
 */

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMe, useUpdateProfile } from '@noema/api-client';
import { useAuth } from '@noema/auth';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  Skeleton,
} from '@noema/ui';
import { Edit2, User, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { toast } from '@/hooks/use-toast';
import { CountrySelector } from '@/components/country-selector';
import { getSortedTimezones } from '@/lib/timezone-data';

const profileSchema = z.object({
  displayName: z
    .string()
    .min(2, 'Display name must be at least 2 characters')
    .max(100, 'Display name must be at most 100 characters'),
  bio: z.string().max(500, 'Bio must be at most 500 characters').optional().or(z.literal('')),
  timezone: z.string().optional(),
  language: z.string().optional(),
  country: z
    .string()
    .length(2, 'Country code must be 2 letters')
    .regex(/^[A-Z]{2}$/, 'Must be a 2-letter uppercase country code')
    .optional()
    .or(z.literal('')),
});

type ProfileFormData = z.infer<typeof profileSchema>;

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'el', label: 'Ελληνικά' },
  { value: 'ru', label: 'Русский' },
  { value: 'ar', label: 'العربية' },
  { value: 'zh', label: '中文' },
  { value: 'pt', label: 'Português' },
] as const;

function getInitials(displayName: string | undefined | null): string {
  if (!displayName) return 'U';
  return displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function ProfilePage(): React.JSX.Element {
  const { user: authUser } = useAuth();
  const { data: user, isLoading } = useMe();
  const updateProfile = useUpdateProfile();
  const [isEditing, setIsEditing] = useState(false);
  const sortedTimezones = getSortedTimezones();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: '',
      bio: '',
      timezone: '',
      language: 'en',
      country: '',
    },
  });

  // Populate form when user data loads
  useEffect(() => {
    if (user !== undefined) {
      reset({
        displayName: user.displayName ?? '',
        bio: user.bio ?? '',
        timezone: user.timezone ?? '',
        language: user.language ?? 'en',
        country: user.country ?? '',
      });
    }
  }, [user, reset]);

  const handleCancelEdit = (): void => {
    if (user !== undefined) {
      reset({
        displayName: user.displayName ?? '',
        bio: user.bio ?? '',
        timezone: user.timezone ?? '',
        language: user.language ?? 'en',
        country: user.country ?? '',
      });
    }
    setIsEditing(false);
  };

  const onSubmit = async (data: ProfileFormData): Promise<void> => {
    const version = user?.version ?? authUser?.version ?? 0;
    try {
      await updateProfile.mutateAsync({
        data: {
          displayName: data.displayName,
          bio: data.bio !== '' ? data.bio ?? null : null,
          timezone: data.timezone !== '' ? data.timezone : undefined,
          language: data.language !== '' ? data.language : undefined,
          country: data.country !== '' ? data.country ?? null : null,
        },
        version,
      });
      toast.success('Profile updated successfully.');
      setIsEditing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Update failed';
      if (message.toLowerCase().includes('version') || message.toLowerCase().includes('conflict')) {
        toast.error('Profile was updated elsewhere. Please refresh the page and try again.');
      } else {
        toast.error(message);
      }
    }
  };

  const displayUser = user ?? authUser;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-page-title">Profile</h1>
          <p className="text-muted-foreground mt-1">Manage your public profile information.</p>
        </div>
        {!isEditing && (
          <Button
            variant="outline"
            onClick={() => {
              setIsEditing(true);
            }}
          >
            <Edit2 className="mr-2 h-4 w-4" />
            Edit Profile
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Avatar card */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Avatar</CardTitle>
            <CardDescription>Your profile picture</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            {isLoading ? (
              <Skeleton className="h-24 w-24 rounded-full" />
            ) : (
              <Avatar className="h-24 w-24">
                <AvatarImage src={displayUser?.avatarUrl ?? undefined} />
                <AvatarFallback className="text-2xl">
                  {getInitials(displayUser?.displayName)}
                </AvatarFallback>
              </Avatar>
            )}
            <Button variant="outline" disabled>
              Change avatar
            </Button>
            <p className="text-xs text-muted-foreground text-center">Avatar upload coming soon</p>
          </CardContent>
        </Card>

        {/* Profile info card */}
        <Card className="md:col-span-2">
          {isEditing ? (
            <form onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
              <CardHeader>
                <CardTitle>Edit Profile</CardTitle>
                <CardDescription>Update your profile details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField label="Email" description="Email cannot be changed">
                  <Input value={displayUser?.email ?? ''} disabled />
                </FormField>

                <FormField label="Display Name" error={errors.displayName?.message} required>
                  <Input placeholder="Your display name" {...register('displayName')} />
                </FormField>

                <FormField
                  label="Bio"
                  error={errors.bio?.message}
                  description="A short description about yourself (max 500 characters)"
                >
                  <textarea
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Tell us about yourself"
                    {...register('bio')}
                  />
                </FormField>

                <FormField label="Language" error={errors.language?.message}>
                  <select
                    {...register('language')}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {LANGUAGES.map((lang) => (
                      <option key={lang.value} value={lang.value}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Timezone" error={errors.timezone?.message}>
                  <select
                    {...register('timezone')}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">Select timezone...</option>
                    {sortedTimezones.map((tz) => (
                      <option key={tz.timezone} value={tz.timezone}>
                        {tz.label} ({tz.utcOffset})
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Country" error={errors.country?.message}>
                  <Controller
                    name="country"
                    control={control}
                    render={({ field }) => (
                      <CountrySelector
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        error={!!errors.country}
                      />
                    )}
                  />
                </FormField>
              </CardContent>
              <CardFooter className="flex gap-2">
                <Button type="submit" disabled={isSubmitting || !isDirty}>
                  {isSubmitting ? 'Saving...' : 'Save changes'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelEdit}
                  disabled={isSubmitting}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              </CardFooter>
            </form>
          ) : (
            <>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>Your profile as others see it</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                ) : (
                  <dl className="space-y-3 text-sm">
                    <div className="grid grid-cols-3 gap-2">
                      <dt className="font-medium text-muted-foreground">Email</dt>
                      <dd className="col-span-2">{displayUser?.email ?? '—'}</dd>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <dt className="font-medium text-muted-foreground">Username</dt>
                      <dd className="col-span-2">@{displayUser?.username ?? '—'}</dd>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <dt className="font-medium text-muted-foreground">Display name</dt>
                      <dd className="col-span-2">{displayUser?.displayName ?? '—'}</dd>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <dt className="font-medium text-muted-foreground">Bio</dt>
                      <dd className="col-span-2 text-muted-foreground">
                        {user?.bio ?? <span className="italic">No bio yet</span>}
                      </dd>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <dt className="font-medium text-muted-foreground">Language</dt>
                      <dd className="col-span-2">{user?.language ?? '—'}</dd>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <dt className="font-medium text-muted-foreground">Timezone</dt>
                      <dd className="col-span-2">{user?.timezone ?? '—'}</dd>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <dt className="font-medium text-muted-foreground">Country</dt>
                      <dd className="col-span-2">{user?.country ?? '—'}</dd>
                    </div>
                    {user?.createdAt !== undefined && (
                      <div className="grid grid-cols-3 gap-2">
                        <dt className="font-medium text-muted-foreground">Member since</dt>
                        <dd className="col-span-2">
                          {new Date(user.createdAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </dd>
                      </div>
                    )}
                  </dl>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
```

**Step 2: Run typecheck**

```bash
pnpm --filter @noema/web typecheck 2>&1 | tail -20
```
Expected: 0 errors. If `UserDto` is missing fields like `bio`, `timezone`, `language`, `country`, `createdAt` — check `packages/api-client/src/user/types.ts` and use only the fields that exist; for missing ones use `undefined` fallback gracefully.

**Step 3: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/profile/page.tsx
git commit -m "feat(web): full profile page with view/edit mode, useMe() data, and optimistic locking"
```

---

## Task 6: Settings Page Full Implementation (T4.4b)

**Files:**
- Modify: `apps/web/src/app/(authenticated)/settings/page.tsx`

**Goal:** Section-by-section settings page wired to `useMySettings()` + `useUpdateSettings()`, with theme toggle, study preferences, notifications, accessibility, change password, and delete account with username confirmation.

**Step 1: Replace the settings page**

```tsx
/**
 * Settings Page
 *
 * Grouped into independent sections — each saves separately.
 * Uses useMySettings() to load and useUpdateSettings() for partial saves.
 * Theme toggle is wired to useTheme() from @noema/ui.
 * Delete account requires typing the username as a safety gate.
 */

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useChangePassword, useDeleteAccount, useMySettings, useUpdateSettings } from '@noema/api-client';
import { useAuth } from '@noema/auth';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  PasswordInput,
  Separator,
  Skeleton,
  useTheme,
} from '@noema/ui';
import { Moon, Sun, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { toast } from '@/hooks/use-toast';

// ============================================================================
// Schemas
// ============================================================================

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Must contain at least one number')
      .regex(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/, 'Must contain a special character'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type PasswordFormData = z.infer<typeof passwordSchema>;

// ============================================================================
// Appearance Section
// ============================================================================

function AppearanceSection(): React.JSX.Element {
  const { theme, setTheme } = useTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Choose how Noema looks to you</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Theme</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Currently: {theme === 'system' ? 'System default' : theme === 'dark' ? 'Dark' : 'Light'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={theme === 'light' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setTheme('light');
              }}
            >
              <Sun className="mr-1.5 h-3.5 w-3.5" />
              Light
            </Button>
            <Button
              variant={theme === 'dark' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setTheme('dark');
              }}
            >
              <Moon className="mr-1.5 h-3.5 w-3.5" />
              Dark
            </Button>
            <Button
              variant={theme === 'system' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setTheme('system');
              }}
            >
              System
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Study Preferences Section
// ============================================================================

function StudyPreferencesSection(): React.JSX.Element {
  const { data: settings, isLoading } = useMySettings();
  const updateSettings = useUpdateSettings();

  const handleDailyGoalChange = async (value: number): Promise<void> => {
    try {
      await updateSettings.mutateAsync({
        data: { dailyGoal: value },
        version: settings?.version ?? 0,
      });
      toast.success('Daily goal updated.');
    } catch {
      toast.error('Failed to update daily goal.');
    }
  };

  const handleToggle = async (
    field: 'studyReminders',
    value: boolean
  ): Promise<void> => {
    try {
      await updateSettings.mutateAsync({
        data: { [field]: value },
        version: settings?.version ?? 0,
      });
      toast.success('Preferences updated.');
    } catch {
      toast.error('Failed to update preferences.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Study Preferences</CardTitle>
        <CardDescription>Customize your learning experience</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Daily goal</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Cards to review per day: <span className="font-mono font-medium">{settings?.dailyGoal ?? 20}</span>
                  </p>
                </div>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                defaultValue={settings?.dailyGoal ?? 20}
                className="w-full accent-primary"
                onMouseUp={(e) => {
                  void handleDailyGoalChange(Number((e.target as HTMLInputElement).value));
                }}
                onTouchEnd={(e) => {
                  void handleDailyGoalChange(Number((e.target as HTMLInputElement).value));
                }}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1</span>
                <span>100</span>
              </div>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Study reminders</p>
                <p className="text-xs text-muted-foreground mt-0.5">Get notified when it's time to review</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings?.studyReminders ?? false}
                onClick={() => {
                  void handleToggle('studyReminders', !(settings?.studyReminders ?? false));
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  (settings?.studyReminders ?? false) ? 'bg-primary' : 'bg-input'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    (settings?.studyReminders ?? false) ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Notifications Section
// ============================================================================

function NotificationsSection(): React.JSX.Element {
  const { data: settings, isLoading } = useMySettings();
  const updateSettings = useUpdateSettings();

  const handleToggle = async (
    field: 'emailNotifications' | 'pushNotifications',
    value: boolean
  ): Promise<void> => {
    try {
      await updateSettings.mutateAsync({
        data: { [field]: value },
        version: settings?.version ?? 0,
      });
      toast.success('Notification settings updated.');
    } catch {
      toast.error('Failed to update notification settings.');
    }
  };

  const toggles: { key: 'emailNotifications' | 'pushNotifications'; label: string; description: string }[] = [
    { key: 'emailNotifications', label: 'Email notifications', description: 'Receive updates and reminders by email' },
    { key: 'pushNotifications', label: 'Push notifications', description: 'Receive browser push notifications' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>Choose how you want to be notified</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : (
          toggles.map((item, i) => (
            <div key={item.key}>
              {i > 0 && <Separator className="mb-4" />}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings?.[item.key] ?? false}
                  onClick={() => {
                    void handleToggle(item.key, !(settings?.[item.key] ?? false));
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    (settings?.[item.key] ?? false) ? 'bg-primary' : 'bg-input'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      (settings?.[item.key] ?? false) ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Accessibility Section
// ============================================================================

function AccessibilitySection(): React.JSX.Element {
  const { data: settings, isLoading } = useMySettings();
  const updateSettings = useUpdateSettings();

  const handleToggle = async (
    field: 'soundEnabled' | 'hapticEnabled',
    value: boolean
  ): Promise<void> => {
    try {
      await updateSettings.mutateAsync({
        data: { [field]: value },
        version: settings?.version ?? 0,
      });
      toast.success('Accessibility settings updated.');
    } catch {
      toast.error('Failed to update accessibility settings.');
    }
  };

  const toggles: { key: 'soundEnabled' | 'hapticEnabled'; label: string; description: string }[] = [
    { key: 'soundEnabled', label: 'Sound effects', description: 'Play sounds on card interactions' },
    { key: 'hapticEnabled', label: 'Haptic feedback', description: 'Vibration feedback on mobile devices' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accessibility</CardTitle>
        <CardDescription>Adjust interaction feedback</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : (
          toggles.map((item, i) => (
            <div key={item.key}>
              {i > 0 && <Separator className="mb-4" />}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings?.[item.key] ?? false}
                  onClick={() => {
                    void handleToggle(item.key, !(settings?.[item.key] ?? false));
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    (settings?.[item.key] ?? false) ? 'bg-primary' : 'bg-input'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      (settings?.[item.key] ?? false) ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Change Password Section
// ============================================================================

function ChangePasswordSection(): React.JSX.Element {
  const changePassword = useChangePassword();
  const { user } = useAuth();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  });

  const onSubmit = async (data: PasswordFormData): Promise<void> => {
    try {
      await changePassword.mutateAsync({
        data: {
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        },
        version: user?.version ?? 0,
      });
      toast.success('Password changed successfully.');
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Password change failed.');
    }
  };

  return (
    <Card>
      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your password to keep your account secure</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField label="Current password" error={errors.currentPassword?.message} required>
            <PasswordInput
              placeholder="••••••••"
              autoComplete="current-password"
              {...register('currentPassword')}
            />
          </FormField>
          <FormField
            label="New password"
            error={errors.newPassword?.message}
            description="At least 8 characters with uppercase, lowercase, number, and special character"
            required
          >
            <PasswordInput
              placeholder="••••••••"
              autoComplete="new-password"
              {...register('newPassword')}
            />
          </FormField>
          <FormField label="Confirm new password" error={errors.confirmPassword?.message} required>
            <PasswordInput
              placeholder="••••••••"
              autoComplete="new-password"
              {...register('confirmPassword')}
            />
          </FormField>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Updating...' : 'Update password'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

// ============================================================================
// Delete Account Section
// ============================================================================

function DeleteAccountSection(): React.JSX.Element {
  const { user, logout } = useAuth();
  const deleteAccount = useDeleteAccount();
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmUsername, setConfirmUsername] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const expectedUsername = user?.username ?? '';
  const confirmationMatches = confirmUsername === expectedUsername;

  const handleDelete = async (): Promise<void> => {
    if (!confirmationMatches) return;
    try {
      setIsDeleting(true);
      await deleteAccount.mutateAsync();
      await logout();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Account deletion failed.');
      setIsDeleting(false);
    }
  };

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive">Danger Zone</CardTitle>
        <CardDescription>
          Permanently delete your account and all associated data. This action cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!showConfirm ? (
          <Button
            variant="destructive"
            onClick={() => {
              setShowConfirm(true);
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete my account
          </Button>
        ) : (
          <div className="space-y-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-destructive">
              This will permanently delete your account, all your cards, knowledge graph data, and
              cannot be reversed.
            </p>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Type your username{' '}
                <span className="font-mono font-semibold text-foreground">
                  {expectedUsername}
                </span>{' '}
                to confirm:
              </p>
              <Input
                value={confirmUsername}
                onChange={(e) => {
                  setConfirmUsername(e.target.value);
                }}
                placeholder={expectedUsername}
                disabled={isDeleting}
                className="max-w-xs"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={() => void handleDelete()}
                disabled={isDeleting || !confirmationMatches}
              >
                {isDeleting ? 'Deleting...' : 'Yes, permanently delete my account'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowConfirm(false);
                  setConfirmUsername('');
                }}
                disabled={isDeleting}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function SettingsPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-page-title">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account settings and preferences.</p>
      </div>

      <div className="space-y-6">
        <AppearanceSection />
        <StudyPreferencesSection />
        <NotificationsSection />
        <AccessibilitySection />
        <ChangePasswordSection />
        <DeleteAccountSection />
      </div>
    </div>
  );
}
```

**Step 2: Verify `Separator` is exported from `@noema/ui`**

```bash
grep "Separator" packages/ui/src/index.ts
```
If not exported, either add it to the ui package index or replace `<Separator />` with `<hr className="border-border" />` in the settings page.

**Step 3: Run typecheck**

```bash
pnpm --filter @noema/web typecheck 2>&1 | tail -20
```
Fix any missing field errors from `UserDto` — use `??` fallbacks and optional chaining.

**Step 4: Run build**

```bash
pnpm --filter @noema/web build 2>&1 | tail -20
```
Expected: build succeeds, all routes shown.

**Step 5: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/settings/page.tsx
git commit -m "feat(web): full settings page with section-by-section saves, theme toggle, and username-gated delete"
```

---

## Acceptance Verification

After all tasks are complete, verify each acceptance criterion:

```bash
# 1. Typecheck passes
pnpm --filter @noema/web typecheck

# 2. Build succeeds with all 11+ routes
pnpm --filter @noema/web build

# 3. Auth store has isSessionExpired
grep "isSessionExpired" packages/auth/dist/types.d.ts

# 4. Redirect logic wired
grep "encodeURIComponent(pathname)" apps/web/src/app/\(authenticated\)/layout.tsx
grep "searchParams.get('redirect')" apps/web/src/app/\(public\)/login/page.tsx

# 5. Session expiry modal exists and is wired
ls apps/web/src/components/session-expiry-modal.tsx
grep "SessionExpiryModal" apps/web/src/app/\(authenticated\)/layout.tsx

# 6. Profile page uses useMe
grep "useMe" apps/web/src/app/\(authenticated\)/profile/page.tsx

# 7. Settings page uses useMySettings + useUpdateSettings
grep "useMySettings\|useUpdateSettings" apps/web/src/app/\(authenticated\)/settings/page.tsx
```
