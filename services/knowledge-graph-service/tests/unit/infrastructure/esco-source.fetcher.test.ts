import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  IOntologyImportArtifact,
  IOntologyImportRun,
  IRawArtifactStore,
} from '../../../src/domain/knowledge-graph-service/ontology-imports.contracts.js';
import { EscoSourceFetcher } from '../../../src/infrastructure/ontology-imports/fetchers/esco/index.js';

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

function buildRun(version = 'v1.2.0'): IOntologyImportRun {
  return {
    id: 'run_esco_fetch_001',
    sourceId: 'esco',
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

describe('EscoSourceFetcher', () => {
  it('downloads paged ESCO source payloads and emits a manifest', async () => {
    const artifactRootDirectory = await mkdtemp(path.join(os.tmpdir(), 'noema-esco-'));
    cleanupPaths.push(artifactRootDirectory);

    const calls: string[] = [];
    const fetchImplementation: typeof fetch = (input) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      calls.push(url);

      const parsedUrl = new URL(url);
      const scheme = parsedUrl.searchParams.get('isInScheme');
      const offset = Number(parsedUrl.searchParams.get('offset') ?? '0');

      const count = resolveRecordCount(scheme, offset);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            _embedded: {
              ...Object.fromEntries(
                Array.from({ length: count }, (_, index) => {
                  const uri = `${scheme ?? 'unknown'}#${String(offset)}-${String(index)}`;
                  return [uri, { uri }];
                })
              ),
            },
            count,
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          }
        )
      );
    };

    const fetcher = new EscoSourceFetcher(new InMemoryRawArtifactStore(), {
      artifactRootDirectory,
      baseUrl: 'https://ec.europa.eu/esco/api/',
      pageSize: 2,
      fetchImplementation,
    });

    const artifacts = await fetcher.fetch(buildRun());

    expect(calls).toContain(
      'https://ec.europa.eu/esco/api/resource/occupation?isInScheme=http%3A%2F%2Fdata.europa.eu%2Fesco%2Fconcept-scheme%2Foccupations&language=en&offset=0&limit=2&viewObsolete=false&selectedVersion=v1.2.0'
    );
    expect(calls).toContain(
      'https://ec.europa.eu/esco/api/resource/occupation?isInScheme=http%3A%2F%2Fdata.europa.eu%2Fesco%2Fconcept-scheme%2Foccupations&language=en&offset=2&limit=2&viewObsolete=false&selectedVersion=v1.2.0'
    );
    expect(calls).toContain(
      'https://ec.europa.eu/esco/api/resource/skill?isInScheme=http%3A%2F%2Fdata.europa.eu%2Fesco%2Fconcept-scheme%2Fskills&language=en&offset=0&limit=2&viewObsolete=false&selectedVersion=v1.2.0'
    );
    expect(calls).toContain(
      'https://ec.europa.eu/esco/api/resource/concept?isInScheme=http%3A%2F%2Fdata.europa.eu%2Fesco%2Fconcept-scheme%2Fqualifications&language=en&offset=0&limit=2&viewObsolete=false&selectedVersion=v1.2.0'
    );

    expect(artifacts).toHaveLength(5);
    expect(artifacts.at(-1)?.kind).toBe('manifest');

    const occupationsPagePath = path.join(
      artifactRootDirectory,
      'ontology-imports',
      'esco',
      'run_esco_fetch_001',
      'occupations',
      'page-0.json'
    );
    const manifestPath = path.join(
      artifactRootDirectory,
      'ontology-imports',
      'esco',
      'run_esco_fetch_001',
      'manifest.json'
    );

    const occupationsPage = JSON.parse(await readFile(occupationsPagePath, 'utf8')) as {
      _embedded: Record<string, { uri: string }>;
    };
    expect(Object.keys(occupationsPage._embedded)).toHaveLength(2);

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      sourceId: string;
      selectedVersion: string | null;
      totalPages: number;
      totalRecords: number;
      pages: { schemeId: string; page: number; recordCount: number }[];
    };

    expect(manifest.sourceId).toBe('esco');
    expect(manifest.selectedVersion).toBe('v1.2.0');
    expect(manifest.totalPages).toBe(4);
    expect(manifest.totalRecords).toBe(5);
    expect(manifest.pages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ schemeId: 'occupations', page: 0, recordCount: 2 }),
        expect.objectContaining({ schemeId: 'occupations', page: 1, recordCount: 1 }),
        expect.objectContaining({ schemeId: 'skills', page: 0, recordCount: 1 }),
        expect.objectContaining({ schemeId: 'qualifications', page: 0, recordCount: 1 }),
      ])
    );
  });
});

function resolveRecordCount(scheme: string | null, offset: number): number {
  if (scheme === 'http://data.europa.eu/esco/concept-scheme/occupations') {
    return offset === 0 ? 2 : offset === 2 ? 1 : 0;
  }

  if (scheme === 'http://data.europa.eu/esco/concept-scheme/skills') {
    return offset === 0 ? 1 : 0;
  }

  if (scheme === 'http://data.europa.eu/esco/concept-scheme/qualifications') {
    return offset === 0 ? 1 : 0;
  }

  return 0;
}
