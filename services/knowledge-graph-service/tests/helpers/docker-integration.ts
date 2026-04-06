import { execFileSync } from 'node:child_process';
import net from 'node:net';

function runDockerCommand(args: readonly string[]): string {
  return execFileSync('docker', [...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).trim();
}

export function canUseDockerRuntime(): boolean {
  try {
    runDockerCommand(['version', '--format', '{{.Server.Version}}']);
    return true;
  } catch {
    return false;
  }
}

async function waitForPort(host: string, port: number, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const connected = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host, port });
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
    });

    if (connected) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Timed out waiting for ${host}:${String(port)} to become ready`);
}

function extractMappedPort(raw: string): number {
  const match = /:(\d+)\s*$/m.exec(raw);
  if (!match) {
    throw new Error(`Unable to parse mapped Docker port from "${raw}"`);
  }

  return Number(match[1]);
}

export async function startRedisContainer(): Promise<{
  redisUrl: string;
  dispose: () => Promise<void>;
}> {
  const containerId = runDockerCommand([
    'run',
    '-d',
    '-P',
    'redis:7-alpine',
    'redis-server',
    '--save',
    '',
    '--appendonly',
    'no',
  ]);
  const port = extractMappedPort(runDockerCommand(['port', containerId, '6379/tcp']));
  await waitForPort('127.0.0.1', port, 30_000);

  return {
    redisUrl: `redis://127.0.0.1:${String(port)}`,
    dispose: () => {
      try {
        runDockerCommand(['rm', '-f', containerId]);
      } catch {
        // Ignore cleanup failures in tests.
      }
      return Promise.resolve();
    },
  };
}

export async function startNeo4jContainer(): Promise<{
  uri: string;
  user: string;
  password: string;
  database: string;
  dispose: () => Promise<void>;
}> {
  const password = 'testsecret';
  const containerId = runDockerCommand([
    'run',
    '-d',
    '-P',
    '-e',
    `NEO4J_AUTH=neo4j/${password}`,
    '-e',
    'NEO4J_server_memory_pagecache_size=128m',
    '-e',
    'NEO4J_server_memory_heap_initial__size=256m',
    '-e',
    'NEO4J_server_memory_heap_max__size=256m',
    'neo4j:5-community',
  ]);
  const boltPort = extractMappedPort(runDockerCommand(['port', containerId, '7687/tcp']));
  await waitForPort('127.0.0.1', boltPort, 90_000);

  return {
    uri: `bolt://127.0.0.1:${String(boltPort)}`,
    user: 'neo4j',
    password,
    database: 'neo4j',
    dispose: () => {
      try {
        runDockerCommand(['rm', '-f', containerId]);
      } catch {
        // Ignore cleanup failures in tests.
      }
      return Promise.resolve();
    },
  };
}
