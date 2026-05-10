const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  repoRoot,
  runtimeDir,
  logsDir,
  pidsDir,
  infraDependencies,
  services,
  envFile,
} = require('./config.cjs');
const {
  ensureDir,
  parseDotEnv,
  readJson,
  writeJson,
  waitForTcpPort,
  waitForHealth,
  runCommandSync,
} = require('./shared.cjs');

const envFromFile = parseDotEnv(envFile);

function pidFileFor(serviceName) {
  return path.join(pidsDir, `${serviceName}.json`);
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getServiceRecord(serviceName) {
  const service = services.find((entry) => entry.name === serviceName);
  if (!service) throw new Error(`Unknown service ${serviceName}`);
  return service;
}

async function ensureInfra() {
  const missing = [];
  for (const dependency of infraDependencies) {
    try {
      await waitForTcpPort(dependency.port, 1000, dependency.name);
    } catch {
      missing.push(dependency);
    }
  }

  if (missing.length === 0) return;

  runCommandSync(
    'docker',
    ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.local.yml', 'up', '-d'],
    { cwd: repoRoot }
  );

  for (const dependency of infraDependencies) {
    await waitForTcpPort(dependency.port, 90000, dependency.name);
  }
}

function spawnService(service) {
  const [command, args] = service.command;
  const stdoutPath = path.join(logsDir, `${service.name}.out.log`);
  const stderrPath = path.join(logsDir, `${service.name}.err.log`);
  const stdout = fs.openSync(stdoutPath, 'a');
  const stderr = fs.openSync(stderrPath, 'a');
  const child = spawn(command, args, {
    cwd: service.cwd,
    detached: true,
    stdio: ['ignore', stdout, stderr],
    shell: false,
    env: {
      ...process.env,
      ...envFromFile,
      NODE_ENV: process.env.NODE_ENV ?? 'development',
      LOG_PRETTY: 'false',
      ...service.env,
    },
  });
  child.unref();
  writeJson(pidFileFor(service.name), {
    name: service.name,
    pid: child.pid,
    port: service.port,
    cwd: service.cwd,
    command,
    args,
    startedAt: new Date().toISOString(),
    stdoutPath,
    stderrPath,
  });
  return child.pid;
}

async function startService(service) {
  const pidRecord = readJson(pidFileFor(service.name));
  if (pidRecord && isProcessRunning(pidRecord.pid)) {
    await waitForHealth(`http://127.0.0.1:${String(service.port)}${service.healthPath}`, 20000);
    return pidRecord.pid;
  }

  if (!fs.existsSync(path.join(service.cwd, 'dist', 'index.js')) && service.name !== 'agents') {
    throw new Error(`Build output missing for ${service.name}. Run the closed-loop stack build first.`);
  }

  const pid = spawnService(service);
  await waitForHealth(`http://127.0.0.1:${String(service.port)}${service.healthPath}`, 90000);
  return pid;
}

async function startStack() {
  ensureDir(runtimeDir);
  ensureDir(logsDir);
  ensureDir(pidsDir);

  await ensureInfra();

  runCommandSync('pnpm', ['run', 'build:packages'], { cwd: repoRoot });
  for (const service of services) {
    if (service.packageName) {
      runCommandSync('pnpm', ['--filter', service.packageName, 'build'], { cwd: repoRoot });
    }
  }

  for (const service of services) {
    try {
      await startService(service);
      process.stdout.write(`[closed-loop] started ${service.name}\n`);
    } catch (error) {
      if (service.optional) {
        process.stdout.write(
          `[closed-loop] skipped optional service ${service.name}: ${error instanceof Error ? error.message : String(error)}\n`
        );
        continue;
      }
      throw error;
    }
  }
}

function stopProcess(pid) {
  if (!isProcessRunning(pid)) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }
}

async function stopStack() {
  for (const service of [...services].reverse()) {
    const pidPath = pidFileFor(service.name);
    const record = readJson(pidPath);
    if (record?.pid) {
      stopProcess(record.pid);
      fs.rmSync(pidPath, { force: true });
    }
  }
}

function readStatus() {
  return services.map((service) => {
    const record = readJson(pidFileFor(service.name));
    return {
      name: service.name,
      pid: record?.pid ?? null,
      running: record?.pid ? isProcessRunning(record.pid) : false,
      port: service.port,
      healthPath: service.healthPath,
    };
  });
}

async function restartService(serviceName) {
  const service = getServiceRecord(serviceName);
  const record = readJson(pidFileFor(service.name));
  if (record?.pid) {
    stopProcess(record.pid);
    fs.rmSync(pidFileFor(service.name), { force: true });
  }
  return startService(service);
}

async function cli() {
  const command = process.argv[2] ?? 'status';
  if (command === 'start') {
    await startStack();
    return;
  }
  if (command === 'stop') {
    await stopStack();
    return;
  }
  if (command === 'restart') {
    const target = process.argv[3];
    if (!target) throw new Error('Usage: node stack.cjs restart <service-name>');
    await restartService(target);
    return;
  }
  process.stdout.write(`${JSON.stringify(readStatus(), null, 2)}\n`);
}

if (require.main === module) {
  cli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

module.exports = {
  startStack,
  stopStack,
  restartService,
  readStatus,
};
