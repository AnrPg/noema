const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const defaultEnvFile = path.join(repoRoot, '.env');
const artifactsRoot = path.join(repoRoot, '.release-artifacts');

const migratableServices = [
  {
    name: 'user-service',
    packageName: '@noema/user-service',
    cwd: path.join(repoRoot, 'services', 'user-service'),
    schemaPath: path.join(repoRoot, 'services', 'user-service', 'prisma', 'schema.prisma'),
    migrationDir: path.join(repoRoot, 'services', 'user-service', 'prisma', 'migrations'),
    dbEnvVar: 'DATABASE_URL_USER',
    databaseName: 'noema_user',
  },
  {
    name: 'content-service',
    packageName: '@noema/content-service',
    cwd: path.join(repoRoot, 'services', 'content-service'),
    schemaPath: path.join(repoRoot, 'services', 'content-service', 'prisma', 'schema.prisma'),
    migrationDir: path.join(repoRoot, 'services', 'content-service', 'prisma', 'migrations'),
    dbEnvVar: 'DATABASE_URL_CONTENT',
    databaseName: 'noema_content',
  },
  {
    name: 'scheduler-service',
    packageName: '@noema/scheduler-service',
    cwd: path.join(repoRoot, 'services', 'scheduler-service'),
    schemaPath: path.join(repoRoot, 'services', 'scheduler-service', 'prisma', 'schema.prisma'),
    migrationDir: path.join(repoRoot, 'services', 'scheduler-service', 'prisma', 'migrations'),
    dbEnvVar: 'DATABASE_URL_SCHEDULER',
    databaseName: 'noema_scheduler',
  },
  {
    name: 'session-service',
    packageName: '@noema/session-service',
    cwd: path.join(repoRoot, 'services', 'session-service'),
    schemaPath: path.join(repoRoot, 'services', 'session-service', 'prisma', 'schema.prisma'),
    migrationDir: path.join(repoRoot, 'services', 'session-service', 'prisma', 'migrations'),
    dbEnvVar: 'DATABASE_URL_SESSION',
    databaseName: 'noema_session',
  },
  {
    name: 'gamification-service',
    packageName: '@noema/gamification-service',
    cwd: path.join(repoRoot, 'services', 'gamification-service'),
    schemaPath: path.join(repoRoot, 'services', 'gamification-service', 'prisma', 'schema.prisma'),
    migrationDir: path.join(repoRoot, 'services', 'gamification-service', 'prisma', 'migrations'),
    dbEnvVar: 'DATABASE_URL_GAMIFICATION',
    databaseName: 'noema_gamification',
  },
  {
    name: 'knowledge-graph-service',
    packageName: '@noema/knowledge-graph-service',
    cwd: path.join(repoRoot, 'services', 'knowledge-graph-service'),
    schemaPath: path.join(
      repoRoot,
      'services',
      'knowledge-graph-service',
      'prisma',
      'schema.prisma'
    ),
    migrationDir: path.join(
      repoRoot,
      'services',
      'knowledge-graph-service',
      'prisma',
      'migrations'
    ),
    dbEnvVar: 'DATABASE_URL_KNOWLEDGE_GRAPH',
    databaseName: 'noema_knowledge_graph',
  },
  {
    name: 'metacognition-service',
    packageName: '@noema/metacognition-service',
    cwd: path.join(repoRoot, 'services', 'metacognition-service'),
    schemaPath: path.join(
      repoRoot,
      'services',
      'metacognition-service',
      'prisma',
      'schema.prisma'
    ),
    migrationDir: path.join(
      repoRoot,
      'services',
      'metacognition-service',
      'prisma',
      'migrations'
    ),
    dbEnvVar: 'DATABASE_URL_METACOGNITION',
    databaseName: 'noema_metacognition',
  },
  {
    name: 'ingestion-service',
    packageName: '@noema/ingestion-service',
    cwd: path.join(repoRoot, 'services', 'ingestion-service'),
    schemaPath: path.join(repoRoot, 'services', 'ingestion-service', 'prisma', 'schema.prisma'),
    migrationDir: path.join(repoRoot, 'services', 'ingestion-service', 'prisma', 'migrations'),
    dbEnvVar: 'DATABASE_URL_INGESTION',
    databaseName: 'noema_ingestion',
  },
  {
    name: 'pedagogy-guardian-service',
    packageName: '@noema/pedagogy-guardian-service',
    cwd: path.join(repoRoot, 'services', 'pedagogy-guardian-service'),
    schemaPath: path.join(
      repoRoot,
      'services',
      'pedagogy-guardian-service',
      'prisma',
      'schema.prisma'
    ),
    migrationDir: path.join(
      repoRoot,
      'services',
      'pedagogy-guardian-service',
      'prisma',
      'migrations'
    ),
    dbEnvVar: 'DATABASE_URL_PEDAGOGY_GUARDIAN',
    databaseName: 'noema_pedagogy_guardian',
  },
  {
    name: 'curriculum-service',
    packageName: '@noema/curriculum-service',
    cwd: path.join(repoRoot, 'services', 'curriculum-service'),
    schemaPath: path.join(repoRoot, 'services', 'curriculum-service', 'prisma', 'schema.prisma'),
    migrationDir: path.join(repoRoot, 'services', 'curriculum-service', 'prisma', 'migrations'),
    dbEnvVar: 'DATABASE_URL_CURRICULUM',
    databaseName: 'noema_curriculum',
  },
];

const redis = {
  envVar: 'REDIS_URL',
  artifactName: 'redis-dump.rdb',
};

module.exports = {
  repoRoot,
  defaultEnvFile,
  artifactsRoot,
  migratableServices,
  redis,
  dockerClients: {
    postgres: 'postgres:16-alpine',
    redis: 'redis:7-alpine',
  },
};
