const fs = require('node:fs');
const path = require('node:path');

const config = require('./config.cjs');
const {
  parseArgs,
  readJson,
  assertOk,
  runPostgresClient,
  buildServiceState,
  mergeEnv,
  loadManifestSchema,
  validateManifestShape,
  createAdminDatabaseUrl,
  parseDatabaseName,
  redactUrl,
} = require('./shared.cjs');

function capturePsql(databaseUrl, sql) {
  const result = runPostgresClient('psql', ['--dbname', databaseUrl, '--tuples-only', '--no-align', '-c', sql], {
    capture: true,
  });
  assertOk(result, `psql ${redactUrl(databaseUrl)}`);
  return result.stdout.trim();
}

function ensureDatabaseExists(databaseUrl) {
  const adminUrl = createAdminDatabaseUrl(databaseUrl);
  const databaseName = parseDatabaseName(databaseUrl);
  const exists = capturePsql(
    adminUrl,
    `SELECT 1 FROM pg_database WHERE datname = '${databaseName.replaceAll("'", "''")}';`
  );
  if (exists === '1') return;
  const create = runPostgresClient('psql', [
    '--dbname',
    adminUrl,
    '-c',
    `CREATE DATABASE "${databaseName.replaceAll('"', '""')}";`,
  ]);
  assertOk(create, `create database ${databaseName}`);
}

function restoreDatabase(databaseUrl, dumpFile) {
  ensureDatabaseExists(databaseUrl);
  const mountDir = path.dirname(dumpFile);
  const mountedFile = process.platform === 'win32' ? `/artifacts/${path.basename(dumpFile)}` : dumpFile;
  const result = runPostgresClient(
    'pg_restore',
    ['--dbname', databaseUrl, '--clean', '--if-exists', '--no-owner', '--no-privileges', mountedFile],
    { mountDir }
  );
  assertOk(result, `restore ${dumpFile}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const releaseId = args['release-id'];
  if (typeof releaseId !== 'string' || releaseId.trim() === '') {
    throw new Error('Missing required --release-id for restore.');
  }
  const manifestPath = path.join(config.artifactsRoot, releaseId, 'rollback-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing rollback manifest: ${manifestPath}`);
  }

  const manifest = readJson(manifestPath);
  const schema = loadManifestSchema(config.repoRoot);
  validateManifestShape(manifest, schema);
  const env = mergeEnv(path.resolve(args['env-file'] ?? manifest.envFile));
  const liveServices = buildServiceState(config, env);
  const liveServiceMap = new Map(liveServices.map((service) => [service.name, service]));

  for (const service of manifest.services) {
    if (!service.databaseExisted || service.dumpFile === '') {
      continue;
    }
    const live = liveServiceMap.get(service.name);
    if (!live) {
      throw new Error(`Cannot resolve live service config for ${service.name}.`);
    }
    restoreDatabase(live.databaseUrl, service.dumpFile);
  }

  process.stdout.write(
    [
      `Databases restored for release ${releaseId}.`,
      'Redis restore is intentionally manual: stop Redis, replace the active dump with the manifest RDB snapshot, then restart Redis before re-enabling event consumers.',
      `Redis snapshot: ${manifest.redis.dumpFile}`,
    ].join('\n') + '\n'
  );
}

main();
