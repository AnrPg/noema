import { expect, test } from '@playwright/test';

const accessTokenPayload = Buffer.from(
  JSON.stringify({
    sub: 'user_devuser00000000000000',
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  })
).toString('base64url');

const accessToken = `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.${accessTokenPayload}.`;

test('renders the learner closed loop from step answer to repair step and dashboard convergence', async ({
  page,
}) => {
  let nextStepCallCount = 0;

  await page.addInitScript((token) => {
    window.localStorage.setItem(
      'noema-auth',
      JSON.stringify({
        state: {
          accessToken: token,
          refreshToken: 'refresh-token',
        },
        version: 2,
      })
    );
  }, accessToken);

  await page.route('**/api/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: 'user_devuser00000000000000',
          email: 'learner@example.com',
          username: 'learner',
          firstName: 'Ada',
          lastName: 'Lovelace',
          roles: ['user'],
          version: 1,
        },
      }),
    });
  });

  await page.route('**/api/me/settings', async (route) => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            studyMode: 'knowledge_gaining',
            version: 2,
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          studyMode: 'knowledge_gaining',
          version: 1,
        },
      }),
    });
  });

  await page.route('**/api/v1/sessions/session_1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: 'session_1',
          config: { topic: 'Bayes theorem' },
          stats: {
            stepsPlanned: 2,
            stepsPresented: 1,
            stepsEvaluated: 1,
            stepsSkipped: 0,
          },
        },
      }),
    });
  });

  await page.route('**/api/v1/sessions/session_1/next-step', async (route) => {
    nextStepCallCount += 1;
    const nextStep =
      nextStepCallCount < 2
        ? {
            id: 'step_1',
            objective: 'Explain Bayes theorem',
            expectedOutcome: 'Learner can explain Bayesian updating.',
            selectedMode: 'explain_your_algorithm',
            transformationType: 'explanation',
            difficulty: 0.6,
            status: 'presented',
            activities: [{ prompt: 'Build a causal chain from prior belief to posterior belief.' }],
          }
        : {
            id: 'step_repair',
            objective: 'Repair the likelihood-ratio step',
            expectedOutcome: 'Learner can restate how evidence shifts posterior odds.',
            selectedMode: 'worked_example',
            transformationType: 'repair',
            difficulty: 0.4,
            status: 'presented',
            activities: [{ prompt: 'Walk through a worked example of updating prior odds.' }],
          };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          session: {
            id: 'session_1',
            config: { topic: 'Bayes theorem' },
            stats: {
              stepsPlanned: 2,
              stepsPresented: nextStepCallCount,
              stepsEvaluated: nextStepCallCount > 1 ? 1 : 0,
              stepsSkipped: 0,
            },
          },
          nextStep,
        },
      }),
    });
  });

  await page.route('**/api/v1/steps/*/present', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { id: 'step_1', status: 'presented' } }),
    });
  });

  await page.route('**/api/v1/steps/*/answer', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: 'step_1',
          status: 'evaluated',
          evaluationId: 'eval_123',
        },
      }),
    });
  });

  await page.route('**/api/v1/users/user_devuser00000000000000/stability-summary**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          stabilityRatio: 0.5,
          stableConcepts: 1,
          unstableConcepts: 1,
          totalConcepts: 2,
          averageReasoning: 0.74,
          domains: [{ domain: 'probability', averageReasoning: 0.74 }],
        },
      }),
    });
  });

  await page.route('**/api/v1/users/user_devuser00000000000000/gamification/summary**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          currentStreak: 3,
          longestStreak: 4,
          level: 2,
          memoryIntegrityScore: 82,
          activeBadgeCount: 1,
        },
      }),
    });
  });

  await page.route('**/api/v1/users/user_devuser00000000000000/gamification/streak**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { currentStreak: 3, longestStreak: 4 } }),
    });
  });

  await page.route('**/api/v1/users/user_devuser00000000000000/gamification/badges**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          badges: [{ id: 'badge_reasoning', label: 'Reasoning Builder', active: true }],
        },
      }),
    });
  });

  await page.route('**/api/v1/users/user_devuser00000000000000/gamification/progression**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          currentTier: 1,
          nextTier: 2,
          progressRatio: 0.5,
          categoriesEngaged: 1,
          activeDays: 3,
        },
      }),
    });
  });

  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/misconceptions')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
      return;
    }

    if (url.includes('/reviews/due') || url.includes('/concepts/due')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { concepts: [] } }),
      });
      return;
    }

    if (url.includes('/sessions?')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
      return;
    }

    await route.fallback();
  });

  await page.goto('/session/session_1');

  await expect(page.getByRole('heading', { name: 'Explain Bayes theorem' })).toBeVisible();
  await page.getByLabel('Step response').fill(
    'Posterior odds equal prior odds multiplied by the likelihood ratio.'
  );
  await page.getByRole('button', { name: /didn't know/i }).click();
  await page.getByLabel(/i met the expected outcome/i).uncheck();
  await page.getByRole('button', { name: /submit step/i }).click();

  await expect(page.getByRole('heading', { name: 'Repair the likelihood-ratio step' })).toBeVisible();
  await expect(page.getByText(/worked example of updating prior odds/i)).toBeVisible();

  await page.goto('/dashboard');

  await expect(page.getByText('Concept Stability')).toBeVisible();
  await expect(page.getByText('1/2')).toBeVisible();
  await expect(page.getByText('Learning Streak')).toBeVisible();
  await expect(page.getByText('3d')).toBeVisible();
  await expect(page.getByText('Stability Overview')).toBeVisible();
});
