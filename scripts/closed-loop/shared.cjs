const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowTag() {
  return new Date().toISOString().replaceAll(':', '-');
}

function parseDotEnv(filePath) {
  const output = {};
  if (!fs.existsSync(filePath)) return output;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/u);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const unquoted =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;
    output[key] = unquoted;
  }
  return output;
}

function tcpProbe(port, host = '127.0.0.1', timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function waitForTcpPort(port, timeoutMs = 90000, label = `port ${port}`) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await tcpProbe(port)) return;
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function httpRequest(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let json = null;
  if (text !== '') {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: response.status, ok: response.ok, text, json };
}

async function waitForHealth(url, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 0;
  while (Date.now() < deadline) {
    try {
      const response = await httpRequest(url);
      lastStatus = response.status;
      if (response.ok) return response;
    } catch {
      // retry
    }
    await sleep(1500);
  }
  throw new Error(`Timed out waiting for health endpoint ${url} (last status ${String(lastStatus)})`);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32' && command.endsWith('.cmd'),
      ...options,
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if ((code ?? 1) !== 0) {
        reject(new Error(`${command} ${args.join(' ')} exited with status ${String(code ?? 1)}`));
        return;
      }
      resolve();
    });
  });
}

function runCommandSync(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${String(result.status ?? 1)}`);
  }
}

module.exports = {
  ensureDir,
  readJson,
  writeJson,
  sleep,
  nowTag,
  parseDotEnv,
  tcpProbe,
  waitForTcpPort,
  httpRequest,
  waitForHealth,
  runCommand,
  runCommandSync,
};
