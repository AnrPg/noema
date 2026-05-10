const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function parseDotEnv(filePath) {
  const output = {};
  if (!filePath || !fs.existsSync(filePath)) return output;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    output[key] =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;
  }
  return output;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function nowTag() {
  return new Date().toISOString().replaceAll(':', '-');
}

function redactUrl(rawValue) {
  try {
    const url = new URL(rawValue);
    if (url.password) url.password = '***';
    if (url.username) url.username = '***';
    return url.toString();
  } catch {
    return '<invalid-url>';
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function mergeEnv(envFilePath) {
  return {
    ...parseDotEnv(envFilePath),
    ...process.env,
  };
}

function requireCommand(command) {
  const lookup = spawnSync(
    process.platform === 'win32' ? 'where.exe' : 'which',
    [command],
    {
      encoding: 'utf8',
      shell: false,
    }
  );
  if ((lookup.status ?? 1) !== 0) return null;
  const first = lookup.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return first ?? null;
}

function run(command, args, options = {}) {
  const normalizedCommand = command.toLowerCase();
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell:
      options.shell ??
      (process.platform === 'win32' &&
        (normalizedCommand === 'pnpm' ||
          normalizedCommand.endsWith('\\pnpm.cmd') ||
          normalizedCommand.endsWith('.cmd'))),
    stdio: options.capture ? 'pipe' : 'inherit',
    cwd: options.cwd,
    env: options.env,
  });
  if (result.error) throw result.error;
  if (!options.capture) return result;
  return result;
}

function assertOk(result, label) {
  if ((result.status ?? 1) !== 0) {
    const stdout = result.stdout?.trim() ?? '';
    const stderr = result.stderr?.trim() ?? '';
    throw new Error(
      `${label} failed with status ${String(result.status ?? 1)}${
        stderr ? `\n${stderr}` : stdout ? `\n${stdout}` : ''
      }`
    );
  }
}

function getGitInfo(repoRoot) {
  const sha = run('git', ['rev-parse', 'HEAD'], { capture: true, cwd: repoRoot });
  const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    capture: true,
    cwd: repoRoot,
  });
  assertOk(sha, 'git rev-parse HEAD');
  assertOk(branch, 'git rev-parse --abbrev-ref HEAD');
  return {
    sha: sha.stdout.trim(),
    branch: branch.stdout.trim(),
  };
}

function normalizeUrlForDocker(rawUrl) {
  const url = new URL(rawUrl);
  if (['127.0.0.1', 'localhost'].includes(url.hostname)) {
    url.hostname = process.platform === 'linux' ? 'host.docker.internal' : 'host.docker.internal';
  }
  return url.toString();
}

function resolveDatabaseUrl(service, env) {
  if (typeof env[service.dbEnvVar] === 'string' && env[service.dbEnvVar].trim() !== '') {
    return {
      value: env[service.dbEnvVar].trim(),
      source: service.dbEnvVar,
    };
  }

  const {
    POSTGRES_USER,
    POSTGRES_PASSWORD,
    POSTGRES_HOST,
    POSTGRES_PORT,
    POSTGRES_SSLMODE,
    POSTGRES_SCHEMA,
  } = env;
  if (
    [POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_HOST, POSTGRES_PORT].every(
      (value) => typeof value === 'string' && value.trim() !== ''
    )
  ) {
    const url = new URL('postgresql://placeholder');
    url.username = POSTGRES_USER;
    url.password = POSTGRES_PASSWORD;
    url.hostname = POSTGRES_HOST;
    url.port = POSTGRES_PORT;
    url.pathname = `/${service.databaseName}`;
    if (typeof POSTGRES_SCHEMA === 'string' && POSTGRES_SCHEMA.trim() !== '') {
      url.searchParams.set('schema', POSTGRES_SCHEMA.trim());
    }
    if (typeof POSTGRES_SSLMODE === 'string' && POSTGRES_SSLMODE.trim() !== '') {
      url.searchParams.set('sslmode', POSTGRES_SSLMODE.trim());
    }
    return {
      value: url.toString(),
      source: 'POSTGRES_* derived',
    };
  }

  throw new Error(
    `Missing ${service.dbEnvVar} and unable to derive a DATABASE_URL for ${service.name}.`
  );
}

function resolveRedisUrl(env) {
  if (typeof env.REDIS_URL === 'string' && env.REDIS_URL.trim() !== '') {
    return {
      value: env.REDIS_URL.trim(),
      source: 'REDIS_URL',
    };
  }
  const { REDIS_HOST, REDIS_PORT, REDIS_PASSWORD } = env;
  if (
    typeof REDIS_HOST === 'string' &&
    REDIS_HOST.trim() !== '' &&
    typeof REDIS_PORT === 'string' &&
    REDIS_PORT.trim() !== ''
  ) {
    const url = new URL('redis://placeholder');
    url.hostname = REDIS_HOST;
    url.port = REDIS_PORT;
    if (typeof REDIS_PASSWORD === 'string' && REDIS_PASSWORD.trim() !== '') {
      url.password = REDIS_PASSWORD.trim();
    }
    return {
      value: url.toString(),
      source: 'REDIS_HOST/REDIS_PORT derived',
    };
  }
  throw new Error('Missing REDIS_URL and unable to derive Redis connection details.');
}

function platformArtifactsPath(nativePath) {
  if (process.platform !== 'win32') {
    return nativePath;
  }
  return path.resolve(nativePath).replaceAll('\\', '/');
}

function runPostgresClient(command, args, options = {}) {
  const local = requireCommand(command);
  if (local) {
    const result = run(local, args, options);
    if (options.capture) return result;
    return result;
  }

  const mountDir = options.mountDir ? path.resolve(options.mountDir) : null;
  const dockerArgs = ['run', '--rm'];
  if (mountDir) {
    dockerArgs.push('-v', `${platformArtifactsPath(mountDir)}:/artifacts`);
  }
  dockerArgs.push(
    '--add-host',
    'host.docker.internal:host-gateway',
    'postgres:16-alpine',
    command,
    ...args.map((arg) =>
      typeof arg === 'string' && arg.startsWith('postgresql://') ? normalizeUrlForDocker(arg) : arg
    )
  );
  return run('docker', dockerArgs, options);
}

function runRedisClient(args, options = {}) {
  const local = requireCommand('redis-cli');
  if (local) {
    return run(local, args, options);
  }
  const mountDir = options.mountDir ? path.resolve(options.mountDir) : null;
  const dockerArgs = ['run', '--rm'];
  if (mountDir) {
    dockerArgs.push('-v', `${platformArtifactsPath(mountDir)}:/artifacts`);
  }
  dockerArgs.push(
    '--add-host',
    'host.docker.internal:host-gateway',
    'redis:7-alpine',
    'redis-cli',
    ...args
  );
  return run('docker', dockerArgs, options);
}

function parseDatabaseName(databaseUrl) {
  const url = new URL(databaseUrl);
  return url.pathname.replace(/^\//u, '');
}

function createAdminDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  url.pathname = '/postgres';
  return url.toString();
}

function buildServiceState(config, env) {
  return config.migratableServices.map((service) => {
    const resolved = resolveDatabaseUrl(service, env);
    return {
      ...service,
      databaseUrl: resolved.value,
      databaseUrlRedacted: redactUrl(resolved.value),
      databaseSource: resolved.source,
    };
  });
}

function loadManifestSchema(repoRoot) {
  return readJson(path.join(repoRoot, 'scripts', 'release', 'manifest-schema.json'));
}

function prismaCommandForService(service) {
  return process.platform === 'win32'
    ? path.join(service.cwd, 'node_modules', '.bin', 'prisma.CMD')
    : path.join(service.cwd, 'node_modules', '.bin', 'prisma');
}

function validateManifestShape(manifest, schema) {
  const requiredRoot = schema.required ?? [];
  for (const key of requiredRoot) {
    if (!(key in manifest)) {
      throw new Error(`Manifest missing required field: ${key}`);
    }
  }
  if (!Array.isArray(manifest.services)) {
    throw new Error('Manifest services must be an array.');
  }
}

module.exports = {
  parseDotEnv,
  ensureDir,
  writeJson,
  readJson,
  nowTag,
  redactUrl,
  sha256File,
  parseArgs,
  mergeEnv,
  requireCommand,
  run,
  assertOk,
  getGitInfo,
  resolveDatabaseUrl,
  resolveRedisUrl,
  normalizeUrlForDocker,
  runPostgresClient,
  runRedisClient,
  parseDatabaseName,
  createAdminDatabaseUrl,
  buildServiceState,
  loadManifestSchema,
  prismaCommandForService,
  validateManifestShape,
};
