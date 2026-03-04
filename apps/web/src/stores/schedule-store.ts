/**
 * Schedule Store — Cached scheduling intelligence.
 *
 * Holds the latest dual-lane plan from the scheduler service.
 * Not persisted — always fetched fresh on page load.
 */

import type { IDualLanePlanResult } from '@noema/api-client/scheduler';
import { create } from 'zustand';

// ============================================================================
// State + Actions
// ============================================================================

interface IScheduleState {
  currentPlan: IDualLanePlanResult | null;
  lastPlanTime: number | null;
}

interface IScheduleActions {
  setPlan: (plan: IDualLanePlanResult) => void;
  clearPlan: () => void;
}

const initialState: IScheduleState = {
  currentPlan: null,
  lastPlanTime: null,
};

// ============================================================================
// Store
// ============================================================================

export const useScheduleStore = create<IScheduleState & IScheduleActions>()((set) => ({
  ...initialState,

  setPlan: (plan) => {
    set({ currentPlan: plan, lastPlanTime: Date.now() });
  },
  clearPlan: () => {
    set({ currentPlan: null, lastPlanTime: null });
  },
}));
