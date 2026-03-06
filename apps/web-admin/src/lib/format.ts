/**
 * @noema/web-admin — lib/format
 * Shared formatting utilities.
 */

/** Truncates a long ID string for display, showing the first 8 chars + ellipsis. */
export function truncateId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

/** Formats an ISO date string to locale date. */
export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString();
}
