import type { ApiError } from '@noema/api-client';

type ApiFieldErrors = Record<string, string[] | undefined>;

export interface IFormatApiErrorOptions {
  action: string;
  fallback: string;
  fieldLabels?: Record<string, string>;
  fieldHints?: Record<string, string>;
  fieldFormatters?: Record<string, (messages: string[], label: string) => string>;
}

interface IApiErrorLike {
  message: string;
  code?: string;
  status?: number;
  fieldErrors?: ApiFieldErrors;
  requestId?: string;
}

const GENERIC_MESSAGE_PATTERNS = [
  /^invalid .* input$/i,
  /^validation error$/i,
  /^bad request$/i,
  /^request failed$/i,
  /^something went wrong$/i,
  /^an error occurred$/i,
];

function asApiErrorLike(error: unknown): IApiErrorLike | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  const candidate = error as Partial<ApiError> & { requestId?: string };
  if (typeof candidate.message !== 'string') {
    return null;
  }

  const result: IApiErrorLike = {
    message: candidate.message,
  };

  if (typeof candidate.code === 'string') {
    result.code = candidate.code;
  }

  if (typeof candidate.status === 'number') {
    result.status = candidate.status;
  }

  if (candidate.fieldErrors !== undefined) {
    result.fieldErrors = candidate.fieldErrors as ApiFieldErrors;
  }

  if (typeof candidate.requestId === 'string') {
    result.requestId = candidate.requestId;
  }

  return result;
}

function humanizeFieldName(value: string): string {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();

  if (spaced === '') {
    return 'This field';
  }

  return spaced.replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeSentence(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/u, '');
}

function withPeriod(value: string): string {
  const normalized = normalizeSentence(value);
  return normalized === '' ? '' : `${normalized}.`;
}

function joinPhrases(values: string[]): string {
  const [first, second, ...rest] = values;

  if (first === undefined) {
    return '';
  }

  if (second === undefined) {
    return first;
  }

  if (rest.length === 0) {
    return `${first} and ${second}`;
  }

  const head = [first, second, ...rest.slice(0, -1)].join('; ');
  const tail = rest[rest.length - 1] ?? '';
  return `${head}; and ${tail}`;
}

function messageLooksGeneric(message: string): boolean {
  const normalized = normalizeSentence(message);
  if (normalized === '') {
    return true;
  }

  return GENERIC_MESSAGE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function collectFieldIssues(
  fieldErrors: ApiFieldErrors | undefined,
  options: IFormatApiErrorOptions
): string[] {
  if (fieldErrors === undefined) {
    return [];
  }

  return Object.entries(fieldErrors)
    .map(([field, rawMessages]) => {
      const messages = (rawMessages ?? [])
        .map((message) => normalizeSentence(message))
        .filter((message) => message !== '');

      if (messages.length === 0) {
        return null;
      }

      const label = options.fieldLabels?.[field] ?? humanizeFieldName(field);
      const customFormatter = options.fieldFormatters?.[field];
      if (customFormatter !== undefined) {
        return withPeriod(customFormatter(messages, label));
      }

      const detail = joinPhrases(Array.from(new Set(messages)));
      const prefix = detail.toLowerCase().startsWith(label.toLowerCase())
        ? detail
        : `${label}: ${detail}`;
      const hint = options.fieldHints?.[field];

      return hint === undefined ? withPeriod(prefix) : withPeriod(`${prefix} ${hint}`);
    })
    .filter((issue): issue is string => issue !== null);
}

function appendRequestId(message: string, requestId: string | undefined): string {
  if (requestId === undefined || requestId.trim() === '') {
    return message;
  }

  return `${message} If you need to report this, include request ID ${requestId}.`;
}

export function formatApiErrorMessage(error: unknown, options: IFormatApiErrorOptions): string {
  const fallback = withPeriod(options.fallback);
  const candidate = asApiErrorLike(error);

  if (candidate === null) {
    if (error instanceof Error && error.message.trim() !== '') {
      return withPeriod(error.message);
    }

    return fallback;
  }

  const message = normalizeSentence(candidate.message);
  const fieldIssues = collectFieldIssues(candidate.fieldErrors, options);
  const hasFieldIssues = fieldIssues.length > 0;

  if (
    candidate.code === 'VALIDATION_ERROR' ||
    hasFieldIssues ||
    candidate.status === 400 ||
    candidate.status === 422
  ) {
    const base = `We couldn't ${options.action} because some values need attention.`;

    if (hasFieldIssues) {
      return `${base} ${joinPhrases(fieldIssues)}`;
    }

    if (!messageLooksGeneric(message)) {
      return `${base} ${withPeriod(message)}`;
    }

    return fallback;
  }

  if (candidate.code === 'TIMEOUT' || candidate.status === 408) {
    return `We couldn't ${options.action} because the server took too long to respond. Please try again.`;
  }

  if (candidate.code === 'NETWORK_ERROR' || candidate.status === 0) {
    return `We couldn't ${options.action} because the app could not reach the server. Check your connection or make sure the local services are still running, then try again.`;
  }

  if (candidate.status === 401) {
    return `We couldn't ${options.action} because your session is no longer valid. Sign in again, then retry.`;
  }

  if (candidate.status === 403) {
    return `You do not have permission to ${options.action}.`;
  }

  if (candidate.status === 404) {
    return `We couldn't ${options.action} because the requested resource was not found. Refresh the page and try again.`;
  }

  if (candidate.status === 409) {
    return `We couldn't ${options.action} because the data changed underneath you. Refresh the page and try again.`;
  }

  if (candidate.status === 429) {
    return `We couldn't ${options.action} because too many requests hit the server at once. Wait a moment, then try again.`;
  }

  if (candidate.status !== undefined && candidate.status >= 500) {
    return appendRequestId(
      `We couldn't ${options.action} because the server hit an internal error. Please try again in a moment.`,
      candidate.requestId
    );
  }

  if (!messageLooksGeneric(message)) {
    return withPeriod(message);
  }

  return appendRequestId(fallback, candidate.requestId);
}
