/**
 * @noema/api-client
 *
 * Type-safe API client for Noema services.
 */

// Client
export {
  ApiRequestError, configureApiClient,
  getApiConfig,
  http,
  request, type ApiClientConfig,
  type ApiError,
  type RequestConfig
} from './client.js';

// User Service
export * from './user/index.js';

// Scheduler Service
export * from './scheduler/index.js';

// React Query Hooks
export * from './hooks/index.js';
