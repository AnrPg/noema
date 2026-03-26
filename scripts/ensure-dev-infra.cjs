const { spawnSync } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const serviceName = process.argv[2];
const repoRoot = path.resolve(__dirname, '..');

const dependencyProbes = {
  postgres: {
    description: 'PostgreSQL on 127.0.0.1:5434',
    check: () => probePostgres(5434),
  },
  redis: {
    description: 'Redis on 127.0.0.1:6380',
    check: () => probeRedis(6380),
  },
  minio: {
    description: 'MinIO on http://127.0.0.1:9002/minio/health/live',
    check: () => probeHttp('127.0.0.1', 9002, '/minio/health/live'),
  },
  neo4j: {
    description: 'Neo4j Bolt on 127.0.0.1:7687',
    check: () => probeTcpPort(7687),
  },
};

const serviceDependencies = {
  'content-service': ['postgres', 'redis', 'minio'],
  'knowledge-graph-service': ['postgres', 'redis', 'neo4j'],
  'scheduler-service': ['postgres', 'redis'],
  'session-service': ['postgres', 'redis'],
  'user-service': ['postgres', 'redis'],
};

if (!serviceName || !(serviceName in serviceDependencies)) {
  const supportedServices = Object.keys(serviceDependencies).join(', ');
  console.error(
    `Usage: node ./scripts/ensure-dev-infra.cjs <service-name>\nSupported services: ${supportedServices}`
  );
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withSocketConnection(port, host, timeoutMs, onConnect) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => onConnect(socket, finish));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

function probeTcpPort(port, host = '127.0.0.1', timeoutMs = 1000) {
  return withSocketConnection(port, host, timeoutMs, (_socket, finish) => finish(true));
}

function probePostgres(port, host = '127.0.0.1', timeoutMs = 2000) {
  const sslRequest = Buffer.from([0, 0, 0, 8, 4, 210, 22, 47]);

  return withSocketConnection(port, host, timeoutMs, (socket, finish) => {
    socket.once('data', (buffer) => {
      const response = buffer.subarray(0, 1).toString('utf8');
      finish(response === 'S' || response === 'N');
    });
    socket.write(sslRequest);
  });
}

function probeRedis(port, host = '127.0.0.1', timeoutMs = 2000) {
  return withSocketConnection(port, host, timeoutMs, (socket, finish) => {
    socket.once('data', (buffer) => {
      finish(buffer.toString('utf8').startsWith('+PONG'));
    });
    socket.write('*1\r\n$4\r\nPING\r\n');
  });
}

function probeHttp(host, port, path, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const request = http.get(
      {
        host,
        port,
        path,
        timeout: timeoutMs,
      },
      (response) => {
        response.resume();
        resolve((response.statusCode ?? 500) < 500);
      }
    );

    request.once('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.once('error', () => resolve(false));
  });
}

async function getUnreadyDependencies(dependencyNames) {
  const checks = await Promise.all(
    dependencyNames.map(async (dependencyName) => {
      const dependency = dependencyProbes[dependencyName];
      const ready = await dependency.check();
      return ready ? null : dependencyName;
    })
  );

  return checks.filter(Boolean);
}

async function waitForDependencies(dependencyNames, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const unreadyDependencies = await getUnreadyDependencies(dependencyNames);
    if (unreadyDependencies.length === 0) {
      return;
    }

    await sleep(2000);
  }

  const unreadyDependencies = await getUnreadyDependencies(dependencyNames);
  const details = unreadyDependencies
    .map((dependencyName) => dependencyProbes[dependencyName].description)
    .join(', ');

  throw new Error(`Required infrastructure is not ready: ${details}`);
}

function runDockerComposeUp() {
  const result = spawnSync(
    'docker',
    ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.local.yml', 'up', '-d'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      timeout: 30000,
    }
  );

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      throw new Error(
        'Docker CLI was not found on PATH. Install Docker Desktop or start the services manually before running this command.'
      );
    }

    throw result.error;
  }

  if ((result.status ?? 0) !== 0) {
    const stderr = result.stderr ?? '';
    const stdout = result.stdout ?? '';
    const dockerOutput = `${stdout}\n${stderr}`;

    if (
      dockerOutput.includes('dockerDesktopLinuxEngine') ||
      dockerOutput.includes('failed to connect to the docker API') ||
      dockerOutput.includes('The system cannot find the file specified')
    ) {
      throw new Error(
        'Docker Desktop is installed but its Linux engine is not running. Start Docker Desktop and wait for it to report that the engine is running, or start PostgreSQL/Redis/MinIO manually on the expected local ports before retrying.'
      );
    }

    throw new Error(`docker compose exited with status ${String(result.status ?? 1)}`);
  }
}

async function main() {
  const dependencies = serviceDependencies[serviceName];
  const unreadyDependencies = await getUnreadyDependencies(dependencies);

  if (unreadyDependencies.length > 0) {
    console.log(
      `[ensure-dev-infra] Starting local infrastructure for ${serviceName} (waiting on: ${unreadyDependencies.join(', ')})`
    );
    runDockerComposeUp();
  }

  await waitForDependencies(dependencies);
  console.log(`[ensure-dev-infra] Local infrastructure is ready for ${serviceName}`);
}

main().catch((error) => {
  console.error('[ensure-dev-infra] Failed to prepare local infrastructure');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
