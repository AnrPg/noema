/**
 * @noema/api-client - Scheduler Hooks (re-export shim)
 *
 * @deprecated
 * Hooks have moved to `scheduler/hooks.ts`.
 * No codebase consumers import from this path — it exists only as a shim
 * during the migration window. Remove after confirming zero consumers.
 *
 * Import from:  `@noema/api-client` (public re-export via index)
 * Source file:  `packages/api-client/src/scheduler/hooks.ts`
 */

export {
  useForecast,
  useSchedulerCardFocusSummary,
  useSchedulerProgressSummary,
  useSchedulerStudyGuidanceSummary,
  schedulerKeys,
  usePredictRetention,
  useReviews,
  useReviewStats,
  useReviewQueue,
  useSchedulerCard,
  useSchedulerCards,
} from '../scheduler/hooks.js';
