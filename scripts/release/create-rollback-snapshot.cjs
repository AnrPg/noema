const fs = require('node:fs');
const path = require('node:path');

const config = require('./config.cjs');
const {
  ensureDir,
  writeJson,
  nowTag,
  parseArgs,
  mergeEnv,
  assertOk,
  getGitInfo,
  resolveRedisUrl,
  run,
  runPostgresClient,
  runRedisClient,
  buildServiceState,
  loadManifestSchema,
  prismaCommandForService,
  validateManifestShape,
  sha256File,
  redactUrl,
} = require('./shared.cjs');

function statusOutput(result) {
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
}

function capturePsql(databaseUrl, sql) {
  const result = runPostgresClient('psql', ['--dbname', databaseUrl, '--tuples-only', '--no-align', '-c', sql], {
    capture: true,
  });
  assertOk(result, `psql ${redactUrl(databaseUrl)}`);
  return result.stdout.trim();
}

function databaseExists(databaseUrl) {
  const adminUrl = new URL(databaseUrl);
  const databaseName = adminUrl.pathname.replace(/^\//u, '');
  adminUrl.pathname = '/postgres';
  const exists = capturePsql(
    adminUrl.toString(),
    `SELECT 1 FROM pg_database WHERE datname = '${databaseName.replaceAll("'", "''")}';`
  );
  return exists === '1';
}

function isAcceptablePrismaStatus(result) {
  const output = statusOutput(result);
  return (
    (result.status ?? 1) === 0 ||
    output.includes('Database schema is up to date') ||
    output.includes('Following migration have not yet been applied') ||
    output.includes('Following migrations have not yet been applied') ||
    output.includes('The current database is not managed by Prisma Migrate')
  );
}

function prismaStatus(service, databaseUrl) {
  const prisma = prismaCommandForService(service);
  const result = run(
    prisma,
    ['migrate', 'status', '--schema', 'prisma/schema.prisma'],
    {
      capture: true,
      cwd: service.cwd,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
    }
  );
  if (!isAcceptablePrismaStatus(result)) {
    assertOk(result, `${service.name} prisma migrate status`);
  }
  return statusOutput(result);
}

function createDbDump(service, databaseUrl, outputFile) {
  const artifactDir = path.dirname(outputFile);
  const targetFile = process.platform === 'win32' ? `/artifacts/${path.basename(outputFile)}` : outputFile;
  const args = ['--dbname', databaseUrl, '--format', 'custom', '--file', targetFile];
  const result = runPostgresClient('pg_dump', args, { mountDir: artifactDir });
  assertOk(result, `${service.name} pg_dump`);
}

function createRedisDump(redisUrl, outputFile) {
  const artifactDir = path.dirname(outputFile);
  const url = new URL(redisUrl);
  const args = ['-u', redisUrl, '--rdb', process.platform === 'win32' ? `/artifacts/${path.basename(outputFile)}` : outputFile];
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
    args[1] = redisUrl.replace(url.hostname, 'host.docker.internal');
  }
  const result = runRedisClient(args, { mountDir: artifactDir });
  assertOk(result, 'redis snapshot');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const envFile = path.resolve(args['env-file'] ?? config.defaultEnvFile);
  const env = mergeEnv(envFile);
  const releaseId = args['release-id'] ?? `release-${nowTag()}`;
  const releaseDir = path.join(config.artifactsRoot, releaseId);
  const dumpsDir = path.join(releaseDir, 'dumps');
  const dryRun = args['dry-run'] === true;

  ensureDir(dumpsDir);

  const services = buildServiceState(config, env);
  const redis = resolveRedisUrl(env);
  const git = getGitInfo(config.repoRoot);

  const manifest = {
    schemaVersion: 1,
    releaseId,
    createdAt: new Date().toISOString(),
    envFile,
    repo: {
      root: config.repoRoot,
      gitSha: git.sha,
      gitBranch: git.branch,
    },
    services: [],
    redis: {
      urlRedacted: redactUrl(redis.value),
      source: redis.source,
      dumpFile: '',
      dumpSha256: '',
      restoreMode: 'manual-rdb-swap',
    },
    status: {
      snapshotCreated: !dryRun,
      migrationsApplied: false,
    },
  };

  for (const service of services) {
    const dumpFile = path.join(dumpsDir, `${service.name}.dump`);
    const existed = databaseExists(service.databaseUrl);
    const statusBefore = existed
      ? prismaStatus(service, service.databaseUrl)
      : 'Database does not exist yet.';
    if (!dryRun) {
      if (existed) {
        createDbDump(service, service.databaseUrl, dumpFile);
      }
    }
    manifest.services.push({
      name: service.name,
      packageName: service.packageName,
      dbEnvVar: service.dbEnvVar,
      databaseExisted: existed,
      databaseUrlRedacted: service.databaseUrlRedacted,
      databaseSource: service.databaseSource,
      schemaPath: service.schemaPath,
      migrationsDir: service.migrationDir,
      dumpFile: existed ? dumpFile : '',
      dumpSha256: existed ? (dryRun ? 'dry-run' : sha256File(dumpFile)) : '',
      statusBefore,
    });
  }

  const redisDumpFile = path.join(dumpsDir, config.redis.artifactName);
  if (!dryRun) {
    createRedisDump(redis.value, redisDumpFile);
  }
  manifest.redis.dumpFile = redisDumpFile;
  manifest.redis.dumpSha256 = dryRun ? 'dry-run' : sha256File(redisDumpFile);

  const schema = loadManifestSchema(config.repoRoot);
  validateManifestShape(manifest, schema);
  writeJson(path.join(releaseDir, 'rollback-manifest.json'), manifest);

  if (dryRun) {
    process.stdout.write(
      `Rollback snapshot plan ready: ${releaseId}\nManifest: ${path.join(releaseDir, 'rollback-manifest.json')}\n`
    );
    return;
  }

  process.stdout.write(
    `Rollback snapshot created: ${releaseId}\nManifest: ${path.join(releaseDir, 'rollback-manifest.json')}\n`
  );
}

main();
