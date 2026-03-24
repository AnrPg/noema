import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  IOntologyImportArtifact,
  IOntologyImportRun,
  IRawArtifactStore,
} from '../../../src/domain/knowledge-graph-service/ontology-imports.contracts.js';
import { YagoSourceFetcher } from '../../../src/infrastructure/ontology-imports/fetchers/yago/index.js';

class InMemoryRawArtifactStore implements IRawArtifactStore {
  private readonly artifacts = new Map<string, IOntologyImportArtifact>();
  private readonly payloads = new Map<string, Buffer>();
  private sequence = 0;

  saveArtifact(
    artifact: Omit<IOntologyImportArtifact, 'id' | 'createdAt'>
  ): Promise<IOntologyImportArtifact> {
    this.sequence += 1;
    const persisted: IOntologyImportArtifact = {
      ...artifact,
      id: `artifact_${String(this.sequence)}`,
      createdAt: new Date().toISOString(),
    };
    this.artifacts.set(artifact.storageKey, persisted);
    return Promise.resolve(persisted);
  }

  getArtifact(storageKey: string): Promise<IOntologyImportArtifact | null> {
    return Promise.resolve(this.artifacts.get(storageKey) ?? null);
  }

  async savePayloadArtifact(input: {
    runId: string;
    sourceId: IOntologyImportArtifact['sourceId'];
    kind: IOntologyImportArtifact['kind'];
    storageKey: string;
    contentType: string | null;
    payload: Buffer | Uint8Array | string;
  }): Promise<IOntologyImportArtifact> {
    const payload =
      typeof input.payload === 'string'
        ? Buffer.from(input.payload, 'utf8')
        : Buffer.from(input.payload);
    this.payloads.set(input.storageKey, payload);
    return this.saveArtifact({
      runId: input.runId,
      sourceId: input.sourceId,
      kind: input.kind,
      storageKey: input.storageKey,
      contentType: input.contentType,
      checksum: 'checksum',
      sizeBytes: payload.byteLength,
    });
  }

  readPayload(storageKey: string): Promise<Buffer> {
    const payload = this.payloads.get(storageKey);
    if (payload === undefined) {
      throw new Error(`Missing payload for ${storageKey}`);
    }
    return Promise.resolve(payload);
  }
}

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (target) => {
      await rm(target, { recursive: true, force: true });
    })
  );
});

function buildRun(version = '4.5.0.2'): IOntologyImportRun {
  return {
    id: 'run_yago_fetch_001',
    sourceId: 'yago',
    sourceVersion: version,
    status: 'queued',
    trigger: 'manual',
    initiatedBy: 'admin',
    createdAt: '2026-03-24T12:00:00.000Z',
    updatedAt: '2026-03-24T12:00:00.000Z',
    startedAt: null,
    completedAt: null,
    failureReason: null,
  };
}

describe('YagoSourceFetcher', () => {
  it('downloads the configured YAGO snapshot and emits a manifest', async () => {
    const artifactRootDirectory = await mkdtemp(path.join(os.tmpdir(), 'noema-yago-'));
    cleanupPaths.push(artifactRootDirectory);

    const calls: { url: string; method: string }[] = [];
    const fetchImplementation: typeof fetch = (input, init) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? 'GET';
      calls.push({ url, method });

      if (method === 'HEAD') {
        return Promise.resolve(
          new Response(null, {
            status: 200,
            headers: {
              'content-length': '4',
              etag: '"etag-1234"',
              'last-modified': 'Tue, 24 Mar 2026 12:00:00 GMT',
            },
          })
        );
      }

      return Promise.resolve(
        new Response(Buffer.from('yago'), {
          status: 200,
          headers: {
            'content-type': 'application/zip',
          },
        })
      );
    };

    const extractImplementation = async (_archivePath: string, targetDirectory: string) => {
      const extractedPath = path.join(targetDirectory, 'taxonomy.tsv');
      await writeFile(
        extractedPath,
        'https://yago-knowledge.org/resource/Leonhard_Euler\trdf:type\thttps://yago-knowledge.org/resource/Mathematician\n',
        'utf8'
      );
    };

    const fetcher = new YagoSourceFetcher(new InMemoryRawArtifactStore(), {
      artifactRootDirectory,
      variant: 'tiny',
      fetchImplementation,
      extractImplementation,
    });

    const artifacts = await fetcher.fetch(buildRun());

    expect(calls).toEqual([
      {
        method: 'HEAD',
        url: 'https://yago-knowledge.org/data/yago4.5/yago-4.5.0.2-tiny.zip',
      },
      {
        method: 'GET',
        url: 'https://yago-knowledge.org/data/yago4.5/yago-4.5.0.2-tiny.zip',
      },
    ]);

    expect(artifacts).toHaveLength(3);
    expect(artifacts[0]?.kind).toBe('raw_payload');
    expect(artifacts[1]?.kind).toBe('raw_payload');
    expect(artifacts[2]?.kind).toBe('manifest');

    const payloadPath = path.join(
      artifactRootDirectory,
      'ontology-imports',
      'yago',
      'run_yago_fetch_001',
      'yago-4.5.0.2-tiny.zip'
    );
    const manifestPath = path.join(
      artifactRootDirectory,
      'ontology-imports',
      'yago',
      'run_yago_fetch_001',
      'manifest.json'
    );

    expect(await readFile(payloadPath, 'utf8')).toBe('yago');

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      releaseVersion: string;
      variant: string;
      upstreamUrl: string;
      checksum: string;
      payloadStorageKey: string;
      extractedStorageKeys: string[];
      etag: string | null;
    };

    expect(manifest.releaseVersion).toBe('4.5.0.2');
    expect(manifest.variant).toBe('tiny');
    expect(manifest.upstreamUrl).toBe(
      'https://yago-knowledge.org/data/yago4.5/yago-4.5.0.2-tiny.zip'
    );
    expect(manifest.payloadStorageKey).toBe(
      'ontology-imports/yago/run_yago_fetch_001/yago-4.5.0.2-tiny.zip'
    );
    expect(manifest.extractedStorageKeys).toEqual([
      'ontology-imports/yago/run_yago_fetch_001/extracted/taxonomy.tsv',
    ]);
    expect(manifest.etag).toBe('etag-1234');
    expect(manifest.checksum).toHaveLength(64);
  });
});
