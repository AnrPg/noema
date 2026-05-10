const fs = require('node:fs');
const path = require('node:path');
const { deterministicFixture, artifactsDir, services, envFile } = require('./config.cjs');
const { ensureDir, httpRequest, nowTag, sleep, waitForHealth, runCommand } = require('./shared.cjs');
const { startStack, stopStack, restartService } = require('./stack.cjs');
const { createProofTokenFactory } = require('./token.cjs');
const issueProofToken = createProofTokenFactory(envFile);

function buildAuthHeaders(options = {}) {
  return {
    Authorization: `Bearer ${issueProofToken(options)}`,
  };
}

function writeArtifact(runDir, fileName, value) {
  ensureDir(runDir);
  const target = path.join(runDir, fileName);
  fs.writeFileSync(
    target,
    typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`,
    'utf8'
  );
}

function normalizeForComparison(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForComparison(item));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = normalizeForComparison(value[key]);
        return acc;
      }, {});
  }
  return value ?? null;
}

async function fetchNextStepSnapshot(userId, sessionId) {
  const response = await httpRequest(`http://127.0.0.1:3004/v1/sessions/${sessionId}/next-step`, {
    method: 'GET',
    headers: buildAuthHeaders({
      userId,
      scopes: ['session:tools:execute'],
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch next step snapshot: ${response.text}`);
  }
  return response.json.data;
}

async function waitForEvaluationSettlement(userId, sessionId, answeredStepId, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await fetchNextStepSnapshot(userId, sessionId);
    if (snapshot.nextStep === null || snapshot.nextStep.id !== answeredStepId) {
      return snapshot;
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for evaluation settlement on step ${answeredStepId}`);
}

async function runWithConcurrency(limit, tasks) {
  const results = new Array(tasks.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await tasks[index]();
    }
  });
  await Promise.all(workers);
  return results;
}

async function verifyHealth(runDir) {
  const checks = [];
  for (const service of services.filter((entry) => !entry.optional)) {
    const url = `http://127.0.0.1:${String(service.port)}${service.healthPath}`;
    const response = await waitForHealth(url, 90000);
    checks.push({ service: service.name, url, status: response.status });
  }
  writeArtifact(runDir, 'health.json', checks);
  return checks;
}

async function createManualCurriculum(userId) {
  const response = await httpRequest('http://127.0.0.1:3017/v1/curricula', {
    method: 'POST',
    headers: {
      ...buildAuthHeaders({ userId, scopes: ['curriculum:write'] }),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(deterministicFixture.manualCurriculum),
  });
  if (!response.ok) {
    throw new Error(`Failed to create manual curriculum: ${response.text}`);
  }
  return response.json.data;
}

async function uploadAndRunIngestion(userId) {
  const documentResponse = await httpRequest('http://127.0.0.1:3009/v1/documents', {
    method: 'POST',
    headers: {
      ...buildAuthHeaders({ userId, scopes: ['ingestion:write'] }),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(deterministicFixture.document),
  });
  if (!documentResponse.ok) {
    throw new Error(`Failed to upload fixture document: ${documentResponse.text}`);
  }

  const jobId = documentResponse.json.data.job.id;
  const documentId = documentResponse.json.data.document.id;
  const runResponse = await httpRequest(`http://127.0.0.1:3009/v1/ingestion/jobs/${jobId}/run`, {
    method: 'POST',
    headers: {
      ...buildAuthHeaders({ userId, scopes: ['ingestion:agent'] }),
    },
  });
  if (!runResponse.ok) {
    throw new Error(`Failed to run ingestion job: ${runResponse.text}`);
  }

  return {
    documentId,
    job: runResponse.json.data.job,
    concepts: runResponse.json.data.concepts ?? [],
  };
}

async function startSessionFlow(userId, curriculumId, stepsOverride) {
  const sessionHeaders = {
    ...buildAuthHeaders({
      userId,
      scopes: ['session:tools:execute'],
    }),
    'Content-Type': 'application/json',
  };
  const sessionResponse = await httpRequest('http://127.0.0.1:3004/v1/sessions', {
    method: 'POST',
    headers: sessionHeaders,
    body: JSON.stringify({
      curriculumId,
      studyMode: deterministicFixture.studyMode,
      topic: deterministicFixture.manualLessonPlan.topic,
    }),
  });
  if (!sessionResponse.ok) throw new Error(`Failed to start session: ${sessionResponse.text}`);

  const sessionId = sessionResponse.json.data.id;
  const lessonPlanResponse = await httpRequest(
    `http://127.0.0.1:3004/v1/sessions/${sessionId}/lesson-plan`,
    {
      method: 'POST',
      headers: sessionHeaders,
      body: JSON.stringify({
        ...deterministicFixture.manualLessonPlan,
        ...(stepsOverride ? { steps: stepsOverride } : {}),
        curriculumId,
      }),
    }
  );
  if (!lessonPlanResponse.ok) {
    throw new Error(`Failed to create lesson plan: ${lessonPlanResponse.text}`);
  }

  const lessonPlanId = lessonPlanResponse.json.data.lessonPlan.id;
  const snapshot = await fetchNextStepSnapshot(userId, sessionId);
  const firstStep = snapshot.nextStep;
  if (firstStep === null) {
    throw new Error(`Session ${sessionId} did not return an initial step.`);
  }
  const presentResponse = await httpRequest(
    `http://127.0.0.1:3004/v1/steps/${firstStep.id}/present`,
    {
      method: 'POST',
      headers: buildAuthHeaders({
        userId,
        scopes: ['session:tools:execute'],
      }),
    }
  );
  if (!presentResponse.ok) throw new Error(`Failed to present step: ${presentResponse.text}`);

  return { sessionId, lessonPlanId, firstStep };
}

function buildTrace(selfRating, correct) {
  return {
    frames: {
      f0: { score: 0.8, notes: 'objective understood' },
      f1: { score: 0.7, notes: 'prompt parsed' },
      f2: { score: 0.7, notes: 'mode selected' },
      f3: { score: 0.7, notes: 'response drafted' },
      f4: { score: 0.7, notes: 'transformation understood' },
      f5: { score: selfRating === 'knew_it' ? 1 : selfRating === 'hesitated' ? 0.5 : 0.2, notes: `Self-rating: ${selfRating}` },
      f6: { score: correct ? 0.85 : 0.2, notes: correct ? 'correct' : 'incorrect' },
    },
  };
}

async function answerStep(userId, stepId, correct, selfRating, responseText) {
  const response = await httpRequest(`http://127.0.0.1:3004/v1/steps/${stepId}/answer`, {
    method: 'POST',
    headers: {
      ...buildAuthHeaders({
        userId,
        scopes: ['session:tools:execute'],
      }),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      response: responseText,
      correct,
      selfRating,
      trace: buildTrace(selfRating, correct),
    }),
  });
  if (!response.ok) throw new Error(`Failed to answer step: ${response.text}`);
  return response.json.data;
}

async function fetchProjectionSummary(userId) {
  const [stability, gamification] = await Promise.all([
    httpRequest(
      `http://127.0.0.1:3006/v1/users/${userId}/stability-summary?studyMode=${deterministicFixture.studyMode}`,
      { headers: buildAuthHeaders({ userId }) }
    ),
    httpRequest(
      `http://127.0.0.1:3005/v1/users/${userId}/gamification/summary?studyMode=${deterministicFixture.studyMode}`,
      { headers: buildAuthHeaders({ userId }) }
    ),
  ]);
  if (!stability.ok) {
    throw new Error(`Failed to fetch stability projection: ${stability.text}`);
  }
  if (!gamification.ok) {
    throw new Error(`Failed to fetch gamification projection: ${gamification.text}`);
  }
  return {
    stability: stability.json.data,
    gamification: gamification.json.data,
  };
}

async function deterministicRun(runDir) {
  ensureDir(runDir);
  const userId = deterministicFixture.userId;
  const ingestion = await uploadAndRunIngestion(userId);
  if (!ingestion?.job?.curriculumId) {
    throw new Error('Ingestion completed without a curriculumId.');
  }
  const curriculum = { id: ingestion.job.curriculumId, source: 'ingestion' };

  const flow = await startSessionFlow(userId, curriculum.id);
  const answeredStep = await answerStep(
    userId,
    flow.firstStep.id,
    true,
    'knew_it',
    'Posterior odds equal prior odds multiplied by the likelihood ratio.'
  );
  const settledSnapshot = await waitForEvaluationSettlement(userId, flow.sessionId, flow.firstStep.id);
  const projectionSummary = await fetchProjectionSummary(userId);

  const artifact = {
    ingestion,
    curriculum,
    flow,
    answeredStep,
    settledSnapshot,
    projectionSummary,
  };
  writeArtifact(runDir, 'deterministic.json', artifact);
  return artifact;
}

async function replayRun(runDir) {
  const baselineDir = path.join(runDir, 'baseline');
  const replayDir = path.join(runDir, 'replay');
  ensureDir(baselineDir);
  ensureDir(replayDir);
  const first = await deterministicRun(baselineDir);
  const second = await deterministicRun(replayDir);
  const comparison = {
    baselineSettledSnapshot: normalizeForComparison(first.settledSnapshot),
    replaySettledSnapshot: normalizeForComparison(second.settledSnapshot),
    baselineProjectionSummary: normalizeForComparison(first.projectionSummary),
    replayProjectionSummary: normalizeForComparison(second.projectionSummary),
  };
  comparison.matches =
    JSON.stringify(comparison.baselineSettledSnapshot) ===
      JSON.stringify(comparison.replaySettledSnapshot) &&
    JSON.stringify(comparison.baselineProjectionSummary) ===
      JSON.stringify(comparison.replayProjectionSummary);
  if (!comparison.matches) {
    throw new Error('Replay run diverged from baseline projections or settled snapshot.');
  }
  writeArtifact(runDir, 'replay-comparison.json', comparison);
  return comparison;
}

async function loadRun(runDir) {
  const userPrefix = 'user_devuser000000000000';
  const concurrency = Number(process.env.CLOSED_LOOP_LOAD_CONCURRENCY ?? 10);
  const curriculum = await createManualCurriculum(deterministicFixture.userId);
  const tasks = Array.from({ length: concurrency }, (_, index) => async () => {
    const userId = `${userPrefix}${String(index).padStart(2, '0')}`.slice(0, 26);
    const flow = await startSessionFlow(userId, curriculum.id, [
      {
        objective: `Explain Bayes theorem run ${String(index)}`,
        expectedOutcome: 'Learner can explain Bayesian updating.',
        conceptRefs: ['concept_bayes_theorem'],
      },
    ]);
    const answered = await answerStep(
      userId,
      flow.firstStep.id,
      index % 2 === 0,
      index % 2 === 0 ? 'knew_it' : 'didnt_know',
      `Synthetic learner response ${String(index)}`
    );
    const settledSnapshot = await waitForEvaluationSettlement(userId, flow.sessionId, flow.firstStep.id);
    return { userId, sessionId: flow.sessionId, answeredStepId: answered.id, settledSnapshot };
  });
  const results = await runWithConcurrency(concurrency, tasks);
  writeArtifact(runDir, 'load.json', { concurrency, results });
  return { concurrency, completed: results.length };
}

async function chaosRun(runDir) {
  const userId = deterministicFixture.userId;
  const curriculum = await createManualCurriculum(userId);
  const flow = await startSessionFlow(userId, curriculum.id, [
    {
      objective: 'Explain Bayes theorem under chaos',
      expectedOutcome: 'Learner can explain Bayesian updating.',
      conceptRefs: ['concept_bayes_theorem'],
    },
  ]);
  const pendingAnswer = answerStep(
    userId,
    flow.firstStep.id,
    false,
    'didnt_know',
    'I am unsure how prior odds are updated.'
  );
  await sleep(500);
  await restartService('metacognition-service');
  const answered = await pendingAnswer;
  const settledSnapshot = await waitForEvaluationSettlement(userId, flow.sessionId, flow.firstStep.id);
  const projectionSummary = await fetchProjectionSummary(userId);
  const result = {
    restartedService: 'metacognition-service',
    sessionId: flow.sessionId,
    answeredStepId: answered.id,
    settledSnapshot,
    projectionSummary,
  };
  writeArtifact(runDir, 'chaos.json', result);
  return result;
}

async function webRun(runDir) {
  await runCommand('pnpm', ['--filter', '@noema/web', 'test:e2e'], {
    cwd: path.resolve(__dirname, '..', '..'),
    env: {
      ...process.env,
      PLAYWRIGHT_JUNIT_OUTPUT_NAME: path.join(runDir, 'playwright-results.xml'),
    },
  });
}

async function main() {
  const mode = process.argv[2] ?? 'deterministic';
  const runDir = path.join(artifactsDir, `${nowTag()}-${mode}`);
  ensureDir(runDir);

  const ownsStack = process.env.CLOSED_LOOP_REUSE_STACK !== 'true';
  if (ownsStack) {
    await startStack();
  }

  try {
    await verifyHealth(runDir);
    try {
      if (mode === 'deterministic') {
        await deterministicRun(runDir);
      } else if (mode === 'replay') {
        await replayRun(runDir);
      } else if (mode === 'load') {
        await loadRun(runDir);
      } else if (mode === 'chaos') {
        await chaosRun(runDir);
      } else if (mode === 'web') {
        await webRun(runDir);
      } else {
        throw new Error(`Unsupported closed-loop mode '${mode}'`);
      }
    } catch (error) {
      writeArtifact(runDir, 'failure.json', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack ?? null : null,
      });
      throw error;
    }
  } finally {
    if (ownsStack) {
      await stopStack();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
