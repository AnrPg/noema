# Error Pages

## Purpose

The learner app now uses custom immersive fallback pages for unresolved routes
and unhandled application failures.

## Routes and Boundaries

- `apps/web/src/app/not-found.tsx` handles missing routes with a full-screen
  `404` experience.
- `apps/web/src/app/error.tsx` handles segment-level runtime failures with a
  retry action.
- `apps/web/src/app/global-error.tsx` mirrors the same recovery experience for
  root-layout failures.
- `apps/web/src/app/(authenticated)/dev/errors/page.tsx` is a dev-only preview
  route for switching between the custom `404` and `500` scenes and triggering
  the real route error boundary.

## Experience Design

- The pages keep Noema's neural visual language by using the shared neuroscience
  palette, glassmorphism panels, and animated graph motifs.
- Copy stays playful and product-relevant, framing missing pages as failed
  retrieval and runtime failures as overloaded cognition rather than generic web
  errors.
- Animation is implemented with CSS and SVG only so the app does not require a
  new motion dependency.
- Reduced-motion users get the same composition without continuous animation.
- The right-side panel now switches into a cognitive recovery mode with two
  canvas mini-games:
  - `Neural Timing` for pulse-sync gameplay with adaptive timing windows
  - `Brain Maze` for signal navigation through distractions and insight pickups

## Recovery Actions

- `404` offers a path back to the knowledge map or home route.
- Runtime errors expose a retry action plus a dashboard escape hatch.
- Error digests and raw messages are surfaced only when available, with full
  messages limited to development mode.
- The recovery panel also exposes a retry path inside the panel itself so the
  user can jump back to the failed action without leaving the screen.
