import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  IOntologyImportArtifact,
  IOntologyImportRun,
  IRawArtifactStore,
} from '../../../src/domain/knowledge-graph-service/ontology-imports.contracts.js';
import { ConceptNetSourceFetcher } from '../../../src/infrastructure/ontology-imports/fetchers/conceptnet/index.js';

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

function buildRun(version = '5.7.0'): IOntologyImportRun {
  return {
    id: 'run_conceptnet_fetch_001',
    sourceId: 'conceptnet',
    sourceVersion: version,
    configuration: {
      mode: null,
      language: null,
      seedNodes: [],
    },
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

describe('ConceptNetSourceFetcher', () => {
  it('downloads the full snapshot in full mode', async () => {
    const artifactRootDirectory = await mkdtemp(path.join(os.tmpdir(), 'noema-conceptnet-'));
    cleanupPaths.push(artifactRootDirectory);

    const calls: string[] = [];
    const fetchImplementation: typeof fetch = (input) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      calls.push(url);

      return Promise.resolve(
        new Response(Buffer.from('conceptnet'), {
          status: 200,
          headers: {
            'content-type': 'application/gzip',
          },
        })
      );
    };

    const fetcher = new ConceptNetSourceFetcher(new InMemoryRawArtifactStore(), {
      artifactRootDirectory,
      mode: 'full',
      fetchImplementation,
    });

    const artifacts = await fetcher.fetch(buildRun());

    expect(calls).toEqual([
      'https://s3.amazonaws.com/conceptnet/downloads/2019/edges/conceptnet-assertions-5.7.0.csv.gz',
    ]);
    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]?.kind).toBe('raw_payload');
    expect(artifacts[1]?.kind).toBe('manifest');
  });

  it('supports targeted API mode with paginated seed-node fetches', async () => {
    const artifactRootDirectory = await mkdtemp(path.join(os.tmpdir(), 'noema-conceptnet-'));
    cleanupPaths.push(artifactRootDirectory);

    const calls: string[] = [];
    const fetchImplementation: typeof fetch = (input) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      calls.push(url);

      const parsedUrl = new URL(url);
      const offset = parsedUrl.searchParams.get('offset');
      const body =
        offset === '0'
          ? {
              edges: [{ '@id': '/a/1' }, { '@id': '/a/2' }],
              view: {
                nextPage: '/query?node=%2Fc%2Fen%2Flearning&offset=2&limit=2',
              },
            }
          : {
              edges: [{ '@id': '/a/3' }],
            };

      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      );
    };

    const fetcher = new ConceptNetSourceFetcher(new InMemoryRawArtifactStore(), {
      artifactRootDirectory,
      mode: 'targeted',
      pageSize: 2,
      maxPagesPerSeed: 3,
      targetedSeedNodes: ['/c/en/learning'],
      fetchImplementation,
    });

    const artifacts = await fetcher.fetch(buildRun());

    expect(calls).toEqual([
      'https://api.conceptnet.io/query?node=%2Fc%2Fen%2Flearning&offset=0&limit=2',
      'https://api.conceptnet.io/query?node=%2Fc%2Fen%2Flearning&offset=2&limit=2',
    ]);
    expect(artifacts).toHaveLength(3);

    const manifestPath = path.join(
      artifactRootDirectory,
      'ontology-imports',
      'conceptnet',
      'run_conceptnet_fetch_001',
      'manifest.json'
    );
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      mode: string;
      totalPages: number;
      totalRecords: number;
    };

    expect(manifest.mode).toBe('targeted');
    expect(manifest.totalPages).toBe(2);
    expect(manifest.totalRecords).toBe(3);
  });
});
