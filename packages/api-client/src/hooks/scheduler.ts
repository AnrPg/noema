/**
 * @noema/api-client - Scheduler Hooks (re-export)
 *
 * Hooks have moved to scheduler/hooks.ts.
 * This file re-exports for backward compatibility.
 */

export {
  schedulerKeys,
  usePredictRetention,
  useReviewQueue,
  useSchedulerCard,
  useSchedulerCards,
} from '../scheduler/hooks.js';
