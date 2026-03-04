/**
 * Schedule Store — Cached scheduling plan.
 * Not persisted — always fresh from API.
 */

import type { IDualLanePlanResult } from '@noema/api-client/scheduler';
import { create } from 'zustand';

interface IScheduleState {
  currentPlan: IDualLanePlanResult | null;
  lastPlanTime: number | null;
}

interface IScheduleActions {
  setPlan: (plan: IDualLanePlanResult) => void;
  clearPlan: () => void;
}

export const useScheduleStore = create<IScheduleState & IScheduleActions>()((set) => ({
  currentPlan: null,
  lastPlanTime: null,

  setPlan: (plan) => {
    set({ currentPlan: plan, lastPlanTime: Date.now() });
  },
  clearPlan: () => {
    set({ currentPlan: null, lastPlanTime: null });
  },
}));
