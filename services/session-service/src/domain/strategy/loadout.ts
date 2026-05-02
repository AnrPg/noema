import type { ICreateStepRecord } from '../session-service/session.repository.js';

export interface IStrategyLoadout {
  id?: string;
  archetype?: string;
}

export function applyLoadoutToStep(
  step: ICreateStepRecord,
  loadout: IStrategyLoadout | undefined
): ICreateStepRecord {
  if (loadout?.archetype === 'concise') {
    return {
      ...step,
      evaluationType: `${step.evaluationType}:concise`,
      activities: step.activities.map((activity) => ({
        ...activity,
        prompt: `${activity.prompt}\n\nAnswer concisely and name the decisive reason.`,
      })),
    };
  }

  if (loadout?.archetype === 'socratic') {
    return {
      ...step,
      activities: step.activities.map((activity) => ({
        ...activity,
        prompt: `${activity.prompt}\n\nExplain the question you asked yourself before answering.`,
      })),
    };
  }

  return step;
}
