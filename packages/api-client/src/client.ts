/**
 * @noema/api-client - HTTP Client
 *
 * Type-safe HTTP client with interceptors for auth tokens.
 */

// ============================================================================
// Types
// ============================================================================

export interface IRequestConfig extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, string | number | boolean | readonly string[] | undefined>;
  timeout?: number;
  baseUrl?: string; // Override global base URL (e.g. for HLR sidecar)
}

export interface IApiClientConfig {
  baseUrl: string;
  credentials?: RequestCredentials;
  onUnauthorized?: () => void;
  onError?: (error: IApiError) => void;
  getAccessToken?: () => string | null;
}

export interface IApiError extends Error {
  status: number;
  code: string;
  fieldErrors?: Record<string, string[]> | undefined;
  details?: unknown;
}

// Backward-compatible aliases (used by index.ts re-exports)
export type RequestConfig = IRequestConfig;
export type ApiClientConfig = IApiClientConfig;
export type ApiError = IApiError;

// ============================================================================
// Error Class
// ============================================================================

export class ApiRequestError extends Error implements IApiError {
  status: number;
  code: string;
  fieldErrors: Record<string, string[]> | undefined;
  details: unknown;

  constructor(
    message: string,
    status: number,
    code: string,
    fieldErrors?: Record<string, string[]>,
    details?: unknown
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors ?? undefined;
    this.details = details ?? undefined;
  }
}

// ============================================================================
// Client Factory
// ============================================================================

let globalConfig: IApiClientConfig | null = null;

/**
 * Configure the global API client.
 * Must be called before making any API requests.
 */
export function configureApiClient(config: IApiClientConfig): void {
  globalConfig = config;
}

/**
 * Get the current API client configuration.
 */
export function getApiConfig(): IApiClientConfig {
  if (!globalConfig) {
    throw new Error('API client not configured. Call configureApiClient() first.');
  }
  return globalConfig;
}

// ============================================================================
// Request Helpers
// ============================================================================

function buildUrl(
  path: string,
  params?: Record<string, string | number | boolean | readonly string[] | undefined>,
  overrideBaseUrl?: string
): string {
  const config = getApiConfig();

  const base = new URL(overrideBaseUrl ?? config.baseUrl);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const trimmedBasePath = base.pathname.replace(/\/+$/, '');
  const basePath = trimmedBasePath === '' ? '/' : trimmedBasePath;

  const hasBasePrefix =
    basePath !== '/' && (normalizedPath === basePath || normalizedPath.startsWith(`${basePath}/`));

  const mergedPath = hasBasePrefix
    ? normalizedPath
    : `${basePath === '/' ? '' : basePath}${normalizedPath}`;

  const url = new URL(mergedPath, `${base.protocol}//${base.host}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined) {
        return;
      }

      if (Array.isArray(value)) {
        value.forEach((entry) => {
          url.searchParams.append(key, entry);
        });
        return;
      }

      url.searchParams.append(key, String(value));
    });
  }

  return url.toString();
}

async function parseErrorResponse(response: Response): Promise<ApiRequestError> {
  try {
    const body = (await response.json()) as {
      error?: {
        code?: string;
        message?: string;
        fieldErrors?: Record<string, string[]>;
        details?: unknown;
      };
    };

    return new ApiRequestError(
      body.error?.message ?? response.statusText,
      response.status,
      body.error?.code ?? 'UNKNOWN_ERROR',
      body.error?.fieldErrors,
      body.error?.details
    );
  } catch {
    return new ApiRequestError(response.statusText, response.status, 'UNKNOWN_ERROR');
  }
}

// ============================================================================
// Main Request Function
// ============================================================================

export async function request<T>(
  method: string,
  path: string,
  config: IRequestConfig = {}
): Promise<T> {
  const apiConfig = getApiConfig();
  const { body, params, timeout = 30000, baseUrl: overrideBaseUrl, ...init } = config;

  const url = buildUrl(path, params, overrideBaseUrl);

  const headers = new Headers(init.headers);

  // Set default content type for JSON
  if (body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Add auth token if available
  const token = apiConfig.getAccessToken?.();
  if (token !== null && token !== undefined && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    const fetchInit: RequestInit = {
      ...init,
      method,
      headers,
      credentials: apiConfig.credentials ?? 'include',
      signal: controller.signal,
    };

    if (body !== undefined) {
      fetchInit.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchInit);

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await parseErrorResponse(response);

      // Handle unauthorized
      if (response.status === 401) {
        apiConfig.onUnauthorized?.();
      }

      apiConfig.onError?.(error);
      throw error;
    }

    // Handle empty responses
    const contentType = response.headers.get('Content-Type');
    if (response.status === 204 || contentType?.includes('application/json') !== true) {
      return undefined as T;
    }

    return await (response.json() as Promise<T>);
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof ApiRequestError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiRequestError('Request timeout', 408, 'TIMEOUT');
    }

    throw new ApiRequestError(
      error instanceof Error ? error.message : 'Network error',
      0,
      'NETWORK_ERROR'
    );
  }
}

// ============================================================================
// HTTP Methods
// ============================================================================

export const http = {
  get: <T>(path: string, config?: IRequestConfig): Promise<T> => request<T>('GET', path, config),

  post: <T>(path: string, body?: unknown, config?: IRequestConfig): Promise<T> =>
    request<T>('POST', path, { ...config, body }),

  put: <T>(path: string, body?: unknown, config?: IRequestConfig): Promise<T> =>
    request<T>('PUT', path, { ...config, body }),

  patch: <T>(path: string, body?: unknown, config?: IRequestConfig): Promise<T> =>
    request<T>('PATCH', path, { ...config, body }),

  delete: <T>(path: string, config?: IRequestConfig): Promise<T> =>
    request<T>('DELETE', path, config),
};
