/**
 * @noema/knowledge-graph-service - ConceptNet Source Fetcher
 *
 * Hybrid fetch adapter that supports both a reproducible full-import snapshot
 * mode and a targeted API mode for smaller, seed-driven commonsense imports.
 */

import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type {
  IOntologyImportArtifact,
  IOntologyImportRun,
  IRawArtifactStore,
  ISourceFetcher,
} from '../../../../domain/knowledge-graph-service/ontology-imports.contracts.js';

type FetchLike = typeof fetch;
type ConceptNetFetchMode = 'full' | 'targeted';

interface IConceptNetFetcherConfig {
  artifactRootDirectory: string;
  mode?: ConceptNetFetchMode;
  defaultReleaseVersion?: string;
  fullDownloadUrlTemplate?: string;
  targetedBaseUrl?: string;
  targetedSeedNodes?: string[];
  pageSize?: number;
  maxPagesPerSeed?: number;
  fetchImplementation?: FetchLike;
}

interface IConceptNetManifestPage {
  seedNode: string;
  requestUrl: string;
  storageKey: string;
  recordCount: number;
  checksum: string;
}

interface IConceptNetManifest {
  sourceId: 'conceptnet';
  runId: string;
  mode: ConceptNetFetchMode;
  releaseVersion: string | null;
  fetchedAt: string;
  payloadStorageKey: string | null;
  payloadChecksum: string | null;
  pages: IConceptNetManifestPage[];
  totalPages: number;
  totalRecords: number;
}

const DEFAULT_CONCEPTNET_RELEASE_VERSION = '5.7.0';
const DEFAULT_CONCEPTNET_FULL_DOWNLOAD_URL_TEMPLATE =
  'https://s3.amazonaws.com/conceptnet/downloads/2019/edges/conceptnet-assertions-{release}.csv.gz';
const DEFAULT_CONCEPTNET_TARGETED_BASE_URL = 'https://api.conceptnet.io/';

export class ConceptNetSourceFetcher implements ISourceFetcher {
  readonly sourceId = 'conceptnet' as const;

  private readonly artifactRootDirectory: string;
  private readonly mode: ConceptNetFetchMode;
  private readonly defaultReleaseVersion: string;
  private readonly fullDownloadUrlTemplate: string;
  private readonly targetedBaseUrl: string;
  private readonly targetedSeedNodes: string[];
  private readonly pageSize: number;
  private readonly maxPagesPerSeed: number;
  private readonly fetchImplementation: FetchLike;

  constructor(
    private readonly rawArtifactStore: IRawArtifactStore,
    config: IConceptNetFetcherConfig
  ) {
    this.artifactRootDirectory = config.artifactRootDirectory;
    this.mode = config.mode ?? 'full';
    this.defaultReleaseVersion = config.defaultReleaseVersion ?? DEFAULT_CONCEPTNET_RELEASE_VERSION;
    this.fullDownloadUrlTemplate =
      config.fullDownloadUrlTemplate ?? DEFAULT_CONCEPTNET_FULL_DOWNLOAD_URL_TEMPLATE;
    this.targetedBaseUrl = ensureTrailingSlash(
      config.targetedBaseUrl ?? DEFAULT_CONCEPTNET_TARGETED_BASE_URL
    );
    this.targetedSeedNodes = config.targetedSeedNodes ?? ['/c/en/learning'];
    this.pageSize = config.pageSize ?? 50;
    this.maxPagesPerSeed = config.maxPagesPerSeed ?? 5;
    this.fetchImplementation = config.fetchImplementation ?? fetch;
  }

  async fetch(run: IOntologyImportRun): Promise<IOntologyImportArtifact[]> {
    const mode = readFetchMode(run, this.mode);
    return mode === 'full' ? this.fetchFullSnapshot(run) : this.fetchTargetedPages(run);
  }

  private async fetchFullSnapshot(run: IOntologyImportRun): Promise<IOntologyImportArtifact[]> {
    const releaseVersion = run.sourceVersion ?? this.defaultReleaseVersion;
    const fileName = `conceptnet-assertions-${releaseVersion}.csv.gz`;
    const upstreamUrl = this.fullDownloadUrlTemplate.replace('{release}', releaseVersion);
    const payloadStorageKey = path.posix.join('ontology-imports', 'conceptnet', run.id, fileName);
    const payloadDownload = await this.downloadPayload(upstreamUrl, payloadStorageKey);
    const payloadArtifact = await this.rawArtifactStore.saveArtifact({
      runId: run.id,
      sourceId: this.sourceId,
      kind: 'raw_payload',
      storageKey: payloadStorageKey,
      contentType: payloadDownload.contentType,
      checksum: payloadDownload.checksum,
      sizeBytes: payloadDownload.sizeBytes,
    });

    const manifest: IConceptNetManifest = {
      sourceId: this.sourceId,
      runId: run.id,
      mode: 'full',
      releaseVersion,
      fetchedAt: new Date().toISOString(),
      payloadStorageKey,
      payloadChecksum: payloadDownload.checksum,
      pages: [],
      totalPages: 0,
      totalRecords: 0,
    };
    const manifestArtifact = await this.writeManifest(run.id, manifest);
    return [payloadArtifact, manifestArtifact];
  }

  private async fetchTargetedPages(run: IOntologyImportRun): Promise<IOntologyImportArtifact[]> {
    const payloadArtifacts: IOntologyImportArtifact[] = [];
    const manifestPages: IConceptNetManifestPage[] = [];
    const seedNodes = readSeedNodes(run, this.targetedSeedNodes);

    for (const seedNode of seedNodes) {
      let nextPath = `/query?node=${encodeURIComponent(seedNode)}&offset=0&limit=${String(this.pageSize)}`;

      for (let pageIndex = 0; pageIndex < this.maxPagesPerSeed && nextPath !== ''; pageIndex += 1) {
        const requestUrl = new URL(trimLeadingSlash(nextPath), this.targetedBaseUrl).toString();
        const response = await this.fetchImplementation(requestUrl, {
          headers: {
            accept: 'application/json',
            'user-agent': 'noema-knowledge-graph-service/0.1.0',
          },
        });

        if (!response.ok) {
          throw new Error(
            `ConceptNet targeted fetch failed for ${seedNode} with status ${String(response.status)}`
          );
        }

        const body = await response.text();
        const payload = JSON.parse(body) as {
          edges?: unknown[];
          view?: { nextPage?: string };
        };
        const recordCount = Array.isArray(payload.edges) ? payload.edges.length : 0;
        if (recordCount === 0) {
          break;
        }

        const storageKey = path.posix.join(
          'ontology-imports',
          'conceptnet',
          run.id,
          sanitizeSeedNode(seedNode),
          `page-${String(pageIndex)}.json`
        );
        const checksum = createHash('sha256').update(body).digest('hex');
        const targetPath = path.join(this.artifactRootDirectory, storageKey);

        await mkdir(path.dirname(targetPath), { recursive: true });
        await writeFile(targetPath, body, 'utf8');

        const artifact = await this.rawArtifactStore.saveArtifact({
          runId: run.id,
          sourceId: this.sourceId,
          kind: 'raw_payload',
          storageKey,
          contentType: response.headers.get('content-type') ?? 'application/json',
          checksum,
          sizeBytes: Buffer.byteLength(body, 'utf8'),
        });

        payloadArtifacts.push(artifact);
        manifestPages.push({
          seedNode,
          requestUrl,
          storageKey,
          recordCount,
          checksum,
        });

        nextPath = payload.view?.nextPage ?? '';
      }
    }

    const manifest: IConceptNetManifest = {
      sourceId: this.sourceId,
      runId: run.id,
      mode: 'targeted',
      releaseVersion: run.sourceVersion ?? null,
      fetchedAt: new Date().toISOString(),
      payloadStorageKey: null,
      payloadChecksum: null,
      pages: manifestPages,
      totalPages: manifestPages.length,
      totalRecords: manifestPages.reduce((sum, page) => sum + page.recordCount, 0),
    };
    const manifestArtifact = await this.writeManifest(run.id, manifest);

    return [...payloadArtifacts, manifestArtifact];
  }

  private async downloadPayload(
    upstreamUrl: string,
    storageKey: string
  ): Promise<{
    checksum: string;
    contentType: string | null;
    sizeBytes: number;
  }> {
    const response = await this.fetchImplementation(upstreamUrl, {
      headers: {
        'user-agent': 'noema-knowledge-graph-service/0.1.0',
      },
    });

    if (!response.ok || response.body === null) {
      throw new Error(`ConceptNet download failed with status ${String(response.status)}`);
    }

    const targetPath = path.join(this.artifactRootDirectory, storageKey);
    await mkdir(path.dirname(targetPath), { recursive: true });

    const hash = createHash('sha256');
    let sizeBytes = 0;
    await pipeline(
      Readable.fromWeb(response.body as globalThis.ReadableStream<Uint8Array>),
      async function* (source) {
        for await (const chunk of source) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          hash.update(buffer);
          sizeBytes += buffer.length;
          yield buffer;
        }
      },
      createWriteStream(targetPath)
    );

    return {
      checksum: hash.digest('hex'),
      contentType: response.headers.get('content-type'),
      sizeBytes,
    };
  }

  private async writeManifest(
    runId: string,
    manifest: IConceptNetManifest
  ): Promise<IOntologyImportArtifact> {
    const storageKey = path.posix.join('ontology-imports', 'conceptnet', runId, 'manifest.json');
    const targetPath = path.join(this.artifactRootDirectory, storageKey);
    const contents = JSON.stringify(manifest, null, 2);
    const checksum = createHash('sha256').update(contents).digest('hex');

    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, contents, 'utf8');

    return this.rawArtifactStore.saveArtifact({
      runId,
      sourceId: this.sourceId,
      kind: 'manifest',
      storageKey,
      contentType: 'application/json',
      checksum,
      sizeBytes: Buffer.byteLength(contents, 'utf8'),
    });
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function trimLeadingSlash(value: string): string {
  return value.startsWith('/') ? value.slice(1) : value;
}

function readFetchMode(
  run: IOntologyImportRun,
  fallback: ConceptNetFetchMode
): ConceptNetFetchMode {
  const configuredMode = readRunConfiguration(run).mode;
  return configuredMode === 'targeted' || configuredMode === 'full' ? configuredMode : fallback;
}

function readSeedNodes(run: IOntologyImportRun, fallback: string[]): string[] {
  const configuredSeedNodes = readRunConfiguration(run).seedNodes;
  return configuredSeedNodes.length > 0 ? configuredSeedNodes : fallback;
}

function readRunConfiguration(run: IOntologyImportRun): {
  mode: string | null;
  language: string | null;
  seedNodes: string[];
} {
  const configuration = (run as Partial<IOntologyImportRun>).configuration;
  return {
    mode: configuration?.mode ?? null,
    language: configuration?.language ?? null,
    seedNodes: configuration?.seedNodes ?? [],
  };
}

function sanitizeSeedNode(seedNode: string): string {
  return seedNode.replaceAll('/', '_').replaceAll(':', '_');
}
