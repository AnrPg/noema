# Navbar Pomodoro Timer

## Purpose

Adds a persistent pomodoro timer to the authenticated shell so learners can
protect focused work without leaving the app.

## Placement

The timer sits in the authenticated top header beside the user dropdown. This
keeps it visible during dashboard, reviews, knowledge-map, and card-library
workflows instead of burying it in a page-level tool.

## Interaction Model

- the main timer pill shows the current phase, the remaining time, and a visual
  progress treatment
- the primary control starts or pauses the current block
- reset returns the timer to a fresh focus block
- the adjacent settings button opens the pomodoro configuration dialog

## Configuration Dialog

The popup is designed as a planning surface, not just a form:

- quick presets for sprint, classic, and deep-work rhythms
- sliders for focus, short-break, long-break, cadence, and daily target
- auto-start toggles for breaks and new focus blocks
- guidance cards explaining how each phase should be used
- a browser-native ambient soundscape picker with adjustable volume

Saving applies the new settings and resets the active timer so the new rhythm
starts cleanly.

## Persistence

Two persistence layers are used:

- durable preferences are stored through `@noema/api-client` and `user-service`
  under `settings.pomodoro`
- live timer runtime is stored locally in browser storage so refreshes do not
  immediately erase an in-progress block

## Soundscape Notes

The soundscape picker uses the Web Audio API instead of bundled audio files.
This keeps the feature self-contained and avoids introducing new frontend
assets.

## Related Files

- `apps/web/src/components/pomodoro/pomodoro-nav.tsx`
- `apps/web/src/hooks/use-pomodoro-soundscape.ts`
- `apps/web/src/lib/pomodoro.ts`
