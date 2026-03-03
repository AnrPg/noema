# Phase 4 — Authentication & Onboarding Polish

> **Codename:** `Amygdala`  
> **Depends on:** Phase 0 (Design Tokens), Phase 3 (Toast, Error Handling)  
> **Unlocks:** Phase 5 (Dashboard), all authenticated routes  
> **Estimated effort:** 2 days

---

## Philosophy

First impressions set the emotional tone. The auth flow is the user's first
encounter with Noema's identity — it should feel like stepping into a calm,
intelligent space. This phase polishes the existing login/register pages to use
the neuroscience palette, adds the missing auth-related screens, and ensures the
auth flow is airtight.

The existing login, register, and forgot-password pages are structurally
complete. This phase is about **visual refinement**, **missing features**, and
**edge-case handling** — not a ground-up rewrite.

---

## Tasks

### T4.1 — Auth Pages Visual Refresh

Update the existing auth pages to use the Phase 0 neuroscience palette and
dark-mode-first design:

**Login page** (`apps/web/src/app/(public)/login/page.tsx`):

- Apply dark background with a subtle neural-network gradient pattern (CSS-only
  radial gradients in synapse/dendrite at very low opacity)
- Brand logo/wordmark at the top of `AuthLayout` — the Brain icon from
  lucide-react, styled with a synapse-colored glow
- Input fields with `axon` border colors, `synapse` focus ring
- "Sign in" button uses the new `--synapse` primary color
- Error alerts use the `cortex` destructive variant
- Subtle `fade-slide-in` animation on the card's entrance

**Register page** (`apps/web/src/app/(public)/register/page.tsx`):

- Same neutral background treatment
- Step indicator at the top: three connected dots with a line (neural pathway
  metaphor), current step glows in `synapse`, completed steps in `neuron`,
  upcoming in `axon-200`
- Maintain the existing 3-step wizard logic

**Forgot password page** (`apps/web/src/app/(public)/forgot-password/page.tsx`):

- Flesh out beyond the scaffold — a complete "enter email → submission
  confirmation" flow
- Uses `authApi` to send a password reset request (or placeholder if endpoint
  doesn't exist yet — show a success state regardless)
- Reuse the `AuthLayout` + card pattern from login

### T4.2 — Post-Login Redirect Logic

Enhance the auth flow to handle:

- **Deep link preservation**: if a user navigates to `/knowledge/graph` while
  logged out, they should be redirected to `/login`, and after successful login,
  redirected back to `/knowledge/graph` (not just `/dashboard`)
- Store the intended destination in a URL query parameter
  (`?redirect=/knowledge/graph`) or in the session store
- `AuthGuard` should read this parameter; `login` success handler should consume
  it

### T4.3 — Session Expiry & Token Refresh UX

The auth package already handles token refresh. Add the UX layer:

- When a 401 is received and refresh fails → show a non-dismissable "Session
  expired" modal (not a toast — this is important enough to block)
- The modal has a "Sign in again" button that redirects to `/login` with the
  current path as `?redirect=...`
- When a refresh succeeds → silently retry the failed request (React Query
  handles this by default if the token is updated before the retry)

**Location:** `apps/web/src/components/session-expiry-modal.tsx`

### T4.4 — Profile & Settings Pages (Existing Routes)

The dashboard sidebar already links to `/profile` and `/settings` — flesh out
these placeholder pages.

**Profile page** (`apps/web/src/app/(authenticated)/profile/page.tsx`):

- Display: avatar (with `Avatar` component), display name, username, email, bio,
  language, timezone, country, member since date
- Edit mode: click "Edit Profile" → inline form with `react-hook-form` + zod
  validation
- Uses `useMe()` to load and `useUpdateProfile()` to save
- Optimistic locking via `version` field — if update fails with version
  conflict, show a toast explaining someone else updated the profile

**Settings page** (`apps/web/src/app/(authenticated)/settings/page.tsx`):

- Grouped into sections using cards:
  - **Appearance**: theme toggle (dark/light) — wired to the Phase 0
    `useTheme()` hook
  - **Study preferences**: daily goal slider (1–100 cards), study reminders
    toggle, reminder time picker
  - **Notifications**: email notifications toggle, push notifications toggle
  - **Accessibility**: sound toggle, haptic toggle
  - **Account**: change password form (current + new + confirm), "Delete
    Account" danger zone with confirmation dialog
- Uses `useMySettings()` to load and `useUpdateSettings()` to save
- Each section saves independently — don't force the user to save everything at
  once

---

## Acceptance Criteria

- [ ] Login, register, and forgot-password pages render with the neuroscience
      palette in both dark and light mode
- [ ] Register wizard step indicator uses the neural-pathway visual metaphor
- [ ] Deep link redirect works: `/knowledge/graph` → login → back to
      `/knowledge/graph`
- [ ] Session expiry modal appears on 401 + refresh failure and blocks
      interaction
- [ ] Profile page loads user data and allows inline editing with optimistic
      locking
- [ ] Settings page supports section-by-section saving
- [ ] Theme toggle in settings immediately switches the page's visual mode
- [ ] Change password form validates and submits correctly
- [ ] Delete account shows a confirmation dialog with "type your username"
      safety gate

---

## Files Touched / Created

| File                                                 | Action                                     |
| ---------------------------------------------------- | ------------------------------------------ |
| `apps/web/src/app/(public)/login/page.tsx`           | Visual refresh                             |
| `apps/web/src/app/(public)/register/page.tsx`        | Visual refresh, step indicator polish      |
| `apps/web/src/app/(public)/forgot-password/page.tsx` | Full implementation                        |
| `apps/web/src/app/(authenticated)/profile/page.tsx`  | Full implementation                        |
| `apps/web/src/app/(authenticated)/settings/page.tsx` | Full implementation                        |
| `apps/web/src/components/session-expiry-modal.tsx`   | **New** — session expiry UX                |
| `apps/web/src/app/(public)/layout.tsx`               | Add redirect query param handling          |
| `apps/web/src/app/(authenticated)/layout.tsx`        | Wire session expiry modal + redirect param |
