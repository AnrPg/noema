export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat().format(value);
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
  }).format(value);
}

export function formatLatency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${String(value)} ms`;
}

export function formatTimestamp(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim() === '') return '—';
  return new Date(value).toLocaleString();
}

export function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
