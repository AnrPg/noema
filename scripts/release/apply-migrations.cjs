const fs = require('node:fs');
const path = require('node:path');

const config = require('./config.cjs');
const {
  parseArgs,
  mergeEnv,
  buildServiceState,
  run,
  assertOk,
  readJson,
  writeJson,
  loadManifestSchema,
  validateManifestShape,
  createAdminDatabaseUrl,
  parseDatabaseName,
  runPostgresClient,
  prismaCommandForService,
} = require('./shared.cjs');

function capturePsql(databaseUrl, sql) {
  const result = runPostgresClient('psql', ['--dbname', databaseUrl, '--tuples-only', '--no-align', '-c', sql], {
    capture: true,
  });
  assertOk(result, `psql ${databaseUrl}`);
  return result.stdout.trim();
}

function statusOutput(result) {
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
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

function ensureCoreExtensions(databaseUrl) {
  const result = runPostgresClient('psql', [
    '--dbname',
    databaseUrl,
    '-c',
    'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS "pgcrypto"; CREATE EXTENSION IF NOT EXISTS "pg_trgm";',
  ]);
  assertOk(result, `ensure core extensions for ${databaseUrl}`);
}

function ensureDatabaseExists(databaseUrl) {
  const adminUrl = createAdminDatabaseUrl(databaseUrl);
  const databaseName = parseDatabaseName(databaseUrl);
  const exists = capturePsql(
    adminUrl,
    `SELECT 1 FROM pg_database WHERE datname = '${databaseName.replaceAll("'", "''")}';`
  );
  if (exists === '1') return false;
  const create = runPostgresClient('psql', [
    '--dbname',
    adminUrl,
    '-c',
    `CREATE DATABASE "${databaseName.replaceAll('"', '""')}";`,
  ]);
  assertOk(create, `create database ${databaseName}`);
  ensureCoreExtensions(databaseUrl);
  return true;
}

function recreateDatabase(databaseUrl) {
  const adminUrl = createAdminDatabaseUrl(databaseUrl);
  const databaseName = parseDatabaseName(databaseUrl).replaceAll('"', '""');
  const terminate = runPostgresClient('psql', [
    '--dbname',
    adminUrl,
    '-c',
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${databaseName.replaceAll("'", "''")}' AND pid <> pg_backend_pid();`,
  ]);
  assertOk(terminate, `terminate connections for ${databaseName}`);
  const drop = runPostgresClient('psql', [
    '--dbname',
    adminUrl,
    '-c',
    `DROP DATABASE IF EXISTS "${databaseName}";`,
  ]);
  assertOk(drop, `drop database ${databaseName}`);
  const create = runPostgresClient('psql', [
    '--dbname',
    adminUrl,
    '-c',
    `CREATE DATABASE "${databaseName}";`,
  ]);
  assertOk(create, `create database ${databaseName}`);
  ensureCoreExtensions(databaseUrl);
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

function migrate(service, databaseUrl) {
  const prisma = prismaCommandForService(service);
  const result = run(
    prisma,
    ['migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
    {
      capture: true,
      cwd: service.cwd,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
    }
  );
  assertOk(result, `${service.name} prisma migrate deploy`);
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const envFile = path.resolve(args['env-file'] ?? config.defaultEnvFile);
  const env = mergeEnv(envFile);
  const releaseId = args['release-id'];
  if (typeof releaseId !== 'string' || releaseId.trim() === '') {
    throw new Error('Missing required --release-id for migration apply.');
  }

  const manifestPath = path.join(config.artifactsRoot, releaseId, 'rollback-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing rollback manifest for release ${releaseId}: ${manifestPath}`);
  }

  const manifest = readJson(manifestPath);
  const schema = loadManifestSchema(config.repoRoot);
  validateManifestShape(manifest, schema);

  const services = buildServiceState(config, env);
  const serviceMap = new Map(services.map((service) => [service.name, service]));
  const ensureDatabases = args['ensure-databases'] === true;
  const resetUnmanagedDatabases = args['reset-unmanaged-databases'] === true;
  const dryRun = args['dry-run'] === true;
  const results = [];

  for (const entry of manifest.services) {
    const service = serviceMap.get(entry.name);
    if (!service) {
      throw new Error(`Cannot resolve service config for ${entry.name}.`);
    }
    const createdDatabase = ensureDatabases ? ensureDatabaseExists(service.databaseUrl) : false;
    let before = prismaStatus(service, service.databaseUrl);
    let resetUnmanaged = false;
    if (before.includes('The current database is not managed by Prisma Migrate')) {
      if (!resetUnmanagedDatabases) {
        throw new Error(
          `${service.name} is not managed by Prisma Migrate. Re-run with --reset-unmanaged-databases only if this environment is disposable.`
        );
      }
      if (!dryRun) {
        recreateDatabase(service.databaseUrl);
      }
      before = dryRun
        ? `${before}\n[dry-run] Would recreate unmanaged database before migrate deploy.`
        : prismaStatus(service, service.databaseUrl);
      resetUnmanaged = true;
    }
    const applied = dryRun ? 'dry-run' : migrate(service, service.databaseUrl);
    const after = prismaStatus(service, service.databaseUrl);
    entry.statusBefore = before;
    entry.statusAfter = after;
    results.push({
      name: service.name,
      createdDatabase,
      resetUnmanaged,
      applied,
      statusAfter: after,
    });
  }

  manifest.status.migrationsApplied = !dryRun;
  manifest.status.migrationsAppliedAt = new Date().toISOString();
  manifest.migrationRun = {
    envFile,
    ensureDatabases,
    resetUnmanagedDatabases,
    dryRun,
    results,
  };
  writeJson(manifestPath, manifest);

  process.stdout.write(
    `${dryRun ? 'Migration plan validated' : 'Migrations applied'} for ${releaseId}\nManifest: ${manifestPath}\n`
  );
}

main();
