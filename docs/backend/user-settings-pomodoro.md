# Pomodoro Settings Persistence

## Purpose

Extends user settings with a first-class pomodoro configuration so the frontend
timer is configurable without inventing a separate persistence channel.

## Data Model

`user-service` now persists `settings.pomodoro` with:

- `focusMinutes`
- `shortBreakMinutes`
- `longBreakMinutes`
- `cyclesBeforeLongBreak`
- `dailyTargetCycles`
- `autoStartBreaks`
- `autoStartFocus`
- `soundscape`
- `soundscapeVolume`

## Hexagonal Flow

- the REST adapter flattens user settings for the web DTO and now includes the
  nested `pomodoro` payload
- the application/domain validation schema enforces pomodoro ranges and
  supported soundscape values
- the repository merges partial pomodoro updates into the stored settings JSON
  instead of replacing the entire settings object
- the API client exposes the same DTO shape back to `apps/web`

## Compatibility

The pomodoro settings are additive. Existing users keep working because
repository defaults backfill missing `settings.pomodoro` fields when older JSON
records are read.

## Related Files

- `services/user-service/src/types/user.types.ts`
- `services/user-service/src/domain/user-service/user.schemas.ts`
- `services/user-service/src/api/rest/user.routes.ts`
- `services/user-service/src/infrastructure/database/prisma-user.repository.ts`
- `packages/api-client/src/user/types.ts`
