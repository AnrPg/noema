/**
 * @noema/api-client
 *
 * Type-safe API client for Noema services.
 */

// Client
export {
  configureApiClient,
  getApiConfig,
  http,
  request,
  ApiRequestError,
  type ApiClientConfig,
  type ApiError,
  type RequestConfig,
} from './client.js';

// User Service
export * from './user/index.js';

// React Query Hooks
export * from './hooks/index.js';
