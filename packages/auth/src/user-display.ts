import type { UserDto } from '@noema/api-client/user';

type UserIdentity = Pick<UserDto, 'displayName' | 'username' | 'email'> | null | undefined;

function getNonEmptyValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return trimmed !== '' ? trimmed : null;
}

export function getUserDisplayName(user: UserIdentity, fallback = 'User'): string {
  return (
    getNonEmptyValue(user?.displayName) ??
    getNonEmptyValue(user?.username) ??
    getNonEmptyValue(user?.email) ??
    fallback
  );
}

export function getUserFirstName(user: UserIdentity, fallback = 'there'): string {
  const primaryName = getNonEmptyValue(user?.displayName) ?? getNonEmptyValue(user?.username);
  if (primaryName === null) return fallback;

  return primaryName.split(/\s+/)[0] ?? fallback;
}

export function getUserInitials(user: UserIdentity, fallback = 'U'): string {
  const primaryName = getUserDisplayName(user, '');
  if (primaryName === '') return fallback;

  const initials = primaryName
    .split(/\s+/)
    .filter((segment) => segment !== '')
    .slice(0, 2)
    .map((segment) => segment[0] ?? '')
    .join('')
    .toUpperCase();

  return initials !== '' ? initials : fallback;
}
