/**
 * @noema/api-client - HTTP Client
 *
 * Type-safe HTTP client with interceptors for auth tokens.
 */

// ============================================================================
// Types
// ============================================================================

export interface RequestConfig extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  timeout?: number;
}

export interface ApiClientConfig {
  baseUrl: string;
  credentials?: RequestCredentials;
  onUnauthorized?: () => void;
  onError?: (error: ApiError) => void;
  getAccessToken?: () => string | null;
}

export interface ApiError extends Error {
  status: number;
  code: string;
  fieldErrors?: Record<string, string[]> | undefined;
  details?: unknown;
}

// ============================================================================
// Error Class
// ============================================================================

export class ApiRequestError extends Error implements ApiError {
  status: number;
  code: string;
  fieldErrors: Record<string, string[]> | undefined;
  details: unknown | undefined;

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

let globalConfig: ApiClientConfig | null = null;

/**
 * Configure the global API client.
 * Must be called before making any API requests.
 */
export function configureApiClient(config: ApiClientConfig): void {
  globalConfig = config;
}

/**
 * Get the current API client configuration.
 */
export function getApiConfig(): ApiClientConfig {
  if (!globalConfig) {
    throw new Error('API client not configured. Call configureApiClient() first.');
  }
  return globalConfig;
}

// ============================================================================
// Request Helpers
// ============================================================================

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const config = getApiConfig();
  const url = new URL(path, config.baseUrl);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  return url.toString();
}

async function parseErrorResponse(response: Response): Promise<ApiRequestError> {
  try {
    const body = await response.json() as {
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
    return new ApiRequestError(
      response.statusText,
      response.status,
      'UNKNOWN_ERROR'
    );
  }
}

// ============================================================================
// Main Request Function
// ============================================================================

export async function request<T>(
  method: string,
  path: string,
  config: RequestConfig = {}
): Promise<T> {
  const apiConfig = getApiConfig();
  const { body, params, timeout = 30000, ...init } = config;

  const url = buildUrl(path, params);
  
  const headers = new Headers(init.headers);
  
  // Set default content type for JSON
  if (body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Add auth token if available
  const token = apiConfig.getAccessToken?.();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => { controller.abort(); }, timeout);

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
    if (response.status === 204 || !contentType?.includes('application/json')) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
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
  get: <T>(path: string, config?: RequestConfig) =>
    request<T>('GET', path, config),

  post: <T>(path: string, body?: unknown, config?: RequestConfig) =>
    request<T>('POST', path, { ...config, body }),

  put: <T>(path: string, body?: unknown, config?: RequestConfig) =>
    request<T>('PUT', path, { ...config, body }),

  patch: <T>(path: string, body?: unknown, config?: RequestConfig) =>
    request<T>('PATCH', path, { ...config, body }),

  delete: <T>(path: string, config?: RequestConfig) =>
    request<T>('DELETE', path, config),
};
