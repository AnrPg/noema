/**
 * @noema/user-service — Me Settings Route Shape Tests
 *
 * Ensures the REST settings routes expose the DTO expected by the web app:
 * flattened settings fields plus `userId` and optimistic-lock `version`.
 */

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerUserRoutes } from '../../../src/api/rest/user.routes.js';
import { buildTestApp, TEST_USER_ID } from './test-app.js';

const BASE_USER = {
  id: TEST_USER_ID,
  version: 1,
  settings: {
    theme: 'system',
    dailyReminderEnabled: true,
    dailyReminderTime: '09:00',
    defaultNewCardsPerDay: 20,
    defaultReviewCardsPerDay: 100,
    soundEnabled: true,
    hapticEnabled: false,
    autoAdvanceEnabled: false,
    showTimerEnabled: true,
    emailStreakReminders: true,
    emailAchievements: true,
    pushNotificationsEnabled: false,
    analyticsEnabled: true,
    activeStudyMode: 'knowledge_gaining',
    pomodoro: {
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      cyclesBeforeLongBreak: 4,
      dailyTargetCycles: 6,
      autoStartBreaks: false,
      autoStartFocus: false,
      soundscape: 'none',
      soundscapeVolume: 35,
    },
    cognitivePolicy: {
      pacingPolicy: {
        targetSecondsPerCard: 45,
        hardCapSecondsPerCard: 120,
        slowdownOnError: true,
      },
      hintPolicy: {
        maxHintsPerCard: 2,
        progressiveHintsOnly: true,
        allowAnswerReveal: false,
      },
      commitPolicy: {
        requireConfidenceBeforeCommit: true,
        requireVerificationGate: false,
      },
      reflectionPolicy: {
        postAttemptReflection: false,
        postSessionReflection: true,
      },
    },
  },
} as const;

function createServiceMock(): {
  findById: ReturnType<typeof vi.fn>;
  updateSettings: ReturnType<typeof vi.fn>;
} {
  return {
    findById: vi.fn().mockResolvedValue({
      data: BASE_USER,
      agentHints: {},
    }),
    updateSettings: vi.fn().mockResolvedValue({
      data: {
        ...BASE_USER,
        version: 2,
        settings: {
          ...BASE_USER.settings,
          activeStudyMode: 'language_learning',
          defaultNewCardsPerDay: 12,
          defaultReviewCardsPerDay: 12,
          dailyReminderEnabled: false,
          pomodoro: {
            ...BASE_USER.settings.pomodoro,
            focusMinutes: 50,
            shortBreakMinutes: 10,
            soundscape: 'deep_focus',
            soundscapeVolume: 48,
          },
        },
      },
      agentHints: {},
    }),
  };
}

describe('Me settings route DTO shape', () => {
  let app: FastifyInstance;
  const service = createServiceMock();

  beforeAll(async () => {
    app = buildTestApp({
      registerRoutes: registerUserRoutes,
      service,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns flattened settings data with version on GET /me/settings', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/me/settings',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      userId: TEST_USER_ID,
      theme: 'system',
      emailNotifications: true,
      pushNotifications: false,
      dailyGoal: 20,
      studyReminders: true,
      reminderTime: '09:00',
      soundEnabled: true,
      hapticEnabled: false,
      activeStudyMode: 'knowledge_gaining',
      pomodoro: {
        focusMinutes: 25,
        shortBreakMinutes: 5,
        longBreakMinutes: 15,
        cyclesBeforeLongBreak: 4,
        dailyTargetCycles: 6,
        autoStartBreaks: false,
        autoStartFocus: false,
        soundscape: 'none',
        soundscapeVolume: 35,
      },
      version: 1,
    });
  });

  it('maps web DTO fields back to domain settings on PATCH /me/settings', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/me/settings',
      payload: {
        data: {
          activeStudyMode: 'language_learning',
          dailyGoal: 12,
          studyReminders: false,
          pomodoro: {
            focusMinutes: 50,
            shortBreakMinutes: 10,
            soundscape: 'deep_focus',
            soundscapeVolume: 48,
          },
        },
        version: 1,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(service.updateSettings).toHaveBeenCalledWith(
      TEST_USER_ID,
      {
        activeStudyMode: 'language_learning',
        defaultNewCardsPerDay: 12,
        defaultReviewCardsPerDay: 12,
        dailyReminderEnabled: false,
        pomodoro: {
          focusMinutes: 50,
          shortBreakMinutes: 10,
          soundscape: 'deep_focus',
          soundscapeVolume: 48,
        },
      },
      1,
      expect.objectContaining({ userId: TEST_USER_ID })
    );
    expect(res.json().data).toEqual({
      userId: TEST_USER_ID,
      theme: 'system',
      emailNotifications: true,
      pushNotifications: false,
      dailyGoal: 12,
      studyReminders: false,
      reminderTime: '09:00',
      soundEnabled: true,
      hapticEnabled: false,
      activeStudyMode: 'language_learning',
      pomodoro: {
        focusMinutes: 50,
        shortBreakMinutes: 10,
        longBreakMinutes: 15,
        cyclesBeforeLongBreak: 4,
        dailyTargetCycles: 6,
        autoStartBreaks: false,
        autoStartFocus: false,
        soundscape: 'deep_focus',
        soundscapeVolume: 48,
      },
      version: 2,
    });
  });
});
