const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const runtimeRoot = path.join(repoRoot, '.closed-loop');
const runtimeDir = path.join(runtimeRoot, 'runtime');
const artifactsDir = path.join(runtimeRoot, 'artifacts');
const logsDir = path.join(runtimeDir, 'logs');
const pidsDir = path.join(runtimeDir, 'pids');
const envFile = path.join(repoRoot, '.env');

const infraDependencies = [
  { name: 'postgres', port: 5434 },
  { name: 'redis', port: 6380 },
  { name: 'neo4j', port: 7687 },
  { name: 'minio', port: 9002 },
  { name: 'qdrant', port: 6335 },
];

const services = [
  {
    name: 'user-service',
    packageName: '@noema/user-service',
    cwd: path.join(repoRoot, 'services', 'user-service'),
    command: ['node', ['--env-file', envFile, 'dist/index.js']],
    port: 3001,
    healthPath: '/health/live',
  },
  {
    name: 'content-service',
    packageName: '@noema/content-service',
    cwd: path.join(repoRoot, 'services', 'content-service'),
    command: ['node', ['--env-file', envFile, 'dist/index.js']],
    port: 3002,
    healthPath: '/health/live',
  },
  {
    name: 'scheduler-service',
    packageName: '@noema/scheduler-service',
    cwd: path.join(repoRoot, 'services', 'scheduler-service'),
    command: ['node', ['--env-file', envFile, 'dist/index.js']],
    port: 3003,
    healthPath: '/health/live',
  },
  {
    name: 'session-service',
    packageName: '@noema/session-service',
    cwd: path.join(repoRoot, 'services', 'session-service'),
    command: ['node', ['--env-file', envFile, 'dist/index.js']],
    port: 3004,
    healthPath: '/health/live',
  },
  {
    name: 'gamification-service',
    packageName: '@noema/gamification-service',
    cwd: path.join(repoRoot, 'services', 'gamification-service'),
    command: ['node', ['--env-file', envFile, 'dist/index.js']],
    port: 3005,
    healthPath: '/health',
  },
  {
    name: 'knowledge-graph-service',
    packageName: '@noema/knowledge-graph-service',
    cwd: path.join(repoRoot, 'services', 'knowledge-graph-service'),
    command: ['node', ['--env-file', envFile, 'dist/index.js']],
    port: 3006,
    healthPath: '/health/live',
  },
  {
    name: 'metacognition-service',
    packageName: '@noema/metacognition-service',
    cwd: path.join(repoRoot, 'services', 'metacognition-service'),
    command: ['node', ['--env-file', envFile, 'dist/index.js']],
    port: 3007,
    healthPath: '/health/live',
  },
  {
    name: 'ingestion-service',
    packageName: '@noema/ingestion-service',
    cwd: path.join(repoRoot, 'services', 'ingestion-service'),
    command: ['node', ['--env-file', envFile, 'dist/index.js']],
    port: 3009,
    healthPath: '/health/live',
  },
  {
    name: 'pedagogy-guardian-service',
    packageName: '@noema/pedagogy-guardian-service',
    cwd: path.join(repoRoot, 'services', 'pedagogy-guardian-service'),
    command: ['node', ['--env-file', envFile, 'dist/index.js']],
    port: 3010,
    healthPath: '/health/live',
  },
  {
    name: 'vector-service',
    packageName: '@noema/vector-service',
    cwd: path.join(repoRoot, 'services', 'vector-service'),
    command: ['node', ['--env-file', envFile, 'dist/index.js']],
    port: 3012,
    healthPath: '/health',
  },
  {
    name: 'curriculum-service',
    packageName: '@noema/curriculum-service',
    cwd: path.join(repoRoot, 'services', 'curriculum-service'),
    command: ['node', ['--env-file', envFile, 'dist/index.js']],
    port: 3017,
    healthPath: '/health/live',
  },
  {
    name: 'agents',
    cwd: path.join(repoRoot, 'agents'),
    command: ['python', ['-m', 'uvicorn', 'src.agents.app:app', '--host', '127.0.0.1', '--port', '8011']],
    port: 8011,
    healthPath: '/health',
    optional: true,
  },
];

const deterministicFixture = {
  userId: 'user_devuser00000000000000',
  studyMode: 'knowledge_gaining',
  document: {
    title: 'Bayes Theorem Primer',
    sourceKind: 'upload',
    mimeKind: 'text/plain',
    intent: 'both',
    content:
      'Bayes theorem updates a prior belief using evidence. Prior odds multiplied by the likelihood ratio produce posterior odds.',
    metadata: {
      batch: '13',
      fixture: 'bayes-primer',
    },
  },
  manualCurriculum: {
    title: 'Bayes Theorem Primer',
    goal: 'Explain Bayesian updating from evidence.',
    domain: 'probability',
    originMode: 'manual',
  },
  manualLessonPlan: {
    rigorLevel: 'minimal',
    topic: 'Bayes theorem',
    prerequisites: ['concept_prior_probability'],
    steps: [
      {
        objective: 'Explain Bayes theorem',
        expectedOutcome: 'Learner can explain Bayesian updating.',
        conceptRefs: ['concept_bayes_theorem'],
      },
      {
        objective: 'Explain why evidence changes confidence',
        expectedOutcome: 'Learner can explain how the likelihood ratio updates belief.',
        conceptRefs: ['concept_likelihood_ratio'],
        isRepair: true,
        transformationType: 'explanation',
      },
    ],
  },
};

module.exports = {
  repoRoot,
  runtimeRoot,
  runtimeDir,
  artifactsDir,
  logsDir,
  pidsDir,
  envFile,
  infraDependencies,
  services,
  deterministicFixture,
};
