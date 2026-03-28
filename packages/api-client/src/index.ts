/**
 * @noema/api-client
 *
 * Type-safe API client for Noema services.
 */

// Client
export {
  ApiRequestError,
  configureApiClient,
  getApiConfig,
  http,
  request,
  type ApiClientConfig,
  type ApiError,
  type RequestConfig,
} from './client.js';

// User Service
export * from './user/index.js';

// Scheduler Service
export * from './scheduler/index.js';

// Content Service
export * from './content/index.js';
export type * from './content/types.js';

// Session Service
export * from './session/index.js';

// Knowledge Graph Service
export * from './knowledge-graph/index.js';
export type * from './knowledge-graph/types.js';

// HLR Sidecar
export * from './hlr/index.js';

// React Query Hooks (user + scheduler - for backward compat)
export * from './hooks/index.js';
export { useSchedulerCardFocusSummary } from './scheduler/hooks.js';
export { useSchedulerStudyGuidanceSummary } from './scheduler/hooks.js';
