/**
 * Timezone Data with Geographic Coordinates
 *
 * Maps COMMON_TIMEZONES from the server to lat/lng coordinates
 * for rendering snap points on the interactive timezone map.
 */

export interface TimezoneCity {
  /** IANA timezone identifier (e.g. "America/New_York") */
  timezone: string;
  /** Display label (city name) */
  label: string;
  /** Latitude in degrees */
  lat: number;
  /** Longitude in degrees */
  lng: number;
  /** UTC offset string for display (e.g. "UTC-5") */
  utcOffset: string;
}

/**
 * Timezone cities with coordinates matching the server's COMMON_TIMEZONES array.
 * Coordinates are approximate city centers.
 */
export const TIMEZONE_CITIES: TimezoneCity[] = [
  { timezone: 'UTC', label: 'UTC', lat: 51.48, lng: 0.0, utcOffset: 'UTC+0' },
  { timezone: 'America/New_York', label: 'New York', lat: 40.71, lng: -74.01, utcOffset: 'UTC-5' },
  { timezone: 'America/Chicago', label: 'Chicago', lat: 41.88, lng: -87.63, utcOffset: 'UTC-6' },
  { timezone: 'America/Denver', label: 'Denver', lat: 39.74, lng: -104.99, utcOffset: 'UTC-7' },
  {
    timezone: 'America/Los_Angeles',
    label: 'Los Angeles',
    lat: 34.05,
    lng: -118.24,
    utcOffset: 'UTC-8',
  },
  {
    timezone: 'America/Anchorage',
    label: 'Anchorage',
    lat: 61.22,
    lng: -149.9,
    utcOffset: 'UTC-9',
  },
  { timezone: 'America/Phoenix', label: 'Phoenix', lat: 33.45, lng: -112.07, utcOffset: 'UTC-7' },
  { timezone: 'America/Toronto', label: 'Toronto', lat: 43.65, lng: -79.38, utcOffset: 'UTC-5' },
  {
    timezone: 'America/Vancouver',
    label: 'Vancouver',
    lat: 49.28,
    lng: -123.12,
    utcOffset: 'UTC-8',
  },
  {
    timezone: 'America/Sao_Paulo',
    label: 'São Paulo',
    lat: -23.55,
    lng: -46.63,
    utcOffset: 'UTC-3',
  },
  {
    timezone: 'America/Mexico_City',
    label: 'Mexico City',
    lat: 19.43,
    lng: -99.13,
    utcOffset: 'UTC-6',
  },
  { timezone: 'Europe/London', label: 'London', lat: 51.51, lng: -0.13, utcOffset: 'UTC+0' },
  { timezone: 'Europe/Paris', label: 'Paris', lat: 48.86, lng: 2.35, utcOffset: 'UTC+1' },
  { timezone: 'Europe/Berlin', label: 'Berlin', lat: 52.52, lng: 13.41, utcOffset: 'UTC+1' },
  { timezone: 'Europe/Madrid', label: 'Madrid', lat: 40.42, lng: -3.7, utcOffset: 'UTC+1' },
  { timezone: 'Europe/Rome', label: 'Rome', lat: 41.9, lng: 12.5, utcOffset: 'UTC+1' },
  { timezone: 'Europe/Amsterdam', label: 'Amsterdam', lat: 52.37, lng: 4.9, utcOffset: 'UTC+1' },
  { timezone: 'Europe/Athens', label: 'Athens', lat: 37.98, lng: 23.73, utcOffset: 'UTC+2' },
  { timezone: 'Europe/Moscow', label: 'Moscow', lat: 55.76, lng: 37.62, utcOffset: 'UTC+3' },
  { timezone: 'Asia/Tokyo', label: 'Tokyo', lat: 35.68, lng: 139.69, utcOffset: 'UTC+9' },
  { timezone: 'Asia/Shanghai', label: 'Shanghai', lat: 31.23, lng: 121.47, utcOffset: 'UTC+8' },
  { timezone: 'Asia/Hong_Kong', label: 'Hong Kong', lat: 22.32, lng: 114.17, utcOffset: 'UTC+8' },
  { timezone: 'Asia/Singapore', label: 'Singapore', lat: 1.35, lng: 103.82, utcOffset: 'UTC+8' },
  { timezone: 'Asia/Seoul', label: 'Seoul', lat: 37.57, lng: 126.98, utcOffset: 'UTC+9' },
  { timezone: 'Asia/Dubai', label: 'Dubai', lat: 25.2, lng: 55.27, utcOffset: 'UTC+4' },
  { timezone: 'Asia/Kolkata', label: 'Kolkata', lat: 22.57, lng: 88.36, utcOffset: 'UTC+5:30' },
  { timezone: 'Asia/Bangkok', label: 'Bangkok', lat: 13.76, lng: 100.5, utcOffset: 'UTC+7' },
  { timezone: 'Australia/Sydney', label: 'Sydney', lat: -33.87, lng: 151.21, utcOffset: 'UTC+11' },
  {
    timezone: 'Australia/Melbourne',
    label: 'Melbourne',
    lat: -37.81,
    lng: 144.96,
    utcOffset: 'UTC+11',
  },
  {
    timezone: 'Pacific/Auckland',
    label: 'Auckland',
    lat: -36.85,
    lng: 174.76,
    utcOffset: 'UTC+13',
  },
  {
    timezone: 'Pacific/Honolulu',
    label: 'Honolulu',
    lat: 21.31,
    lng: -157.86,
    utcOffset: 'UTC-10',
  },
];

/**
 * Get sorted timezones list for dropdown display.
 * Sorted by UTC offset (west to east), then alphabetically.
 */
export function getSortedTimezones(): TimezoneCity[] {
  return [...TIMEZONE_CITIES].sort((a, b) => {
    const offsetA = parseUtcOffset(a.utcOffset);
    const offsetB = parseUtcOffset(b.utcOffset);
    if (offsetA !== offsetB) return offsetA - offsetB;
    return a.label.localeCompare(b.label);
  });
}

/**
 * Parse a UTC offset string like "UTC+5:30" or "UTC-8" into total minutes.
 */
function parseUtcOffset(offset: string): number {
  const match = /UTC([+-])(\d+)(?::(\d+))?/.exec(offset);
  if (!match) return 0;
  const sign = match[1] === '+' ? 1 : -1;
  const hours = parseInt(match[2]!, 10);
  const minutes = parseInt(match[3] || '0', 10);
  return sign * (hours * 60 + minutes);
}

/**
 * Get the current time formatted for a specific timezone.
 */
export function formatTimeInTimezone(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date());
  } catch {
    return '--:--';
  }
}

/** Lookup map: IANA timezone → TimezoneCity */
export const TIMEZONE_BY_ID = new Map<string, TimezoneCity>(
  TIMEZONE_CITIES.map((tz) => [tz.timezone, tz])
);
