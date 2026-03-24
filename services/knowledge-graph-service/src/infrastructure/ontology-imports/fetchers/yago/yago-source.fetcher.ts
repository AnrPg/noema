/**
 * @noema/knowledge-graph-service - YAGO Source Fetcher
 *
 * Bulk snapshot fetcher for YAGO releases. It downloads the configured zip
 * artifact programmatically, records immutable artifact metadata, and writes a
 * manifest describing the upstream release that was fetched.
 */

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import type {
  IOntologyImportArtifact,
  IOntologyImportRun,
  IRawArtifactStore,
  ISourceFetcher,
} from '../../../../domain/knowledge-graph-service/ontology-imports.contracts.js';

type FetchLike = typeof fetch;
type YagoVariant = 'tiny' | 'full';

interface IYagoFetcherConfig {
  artifactRootDirectory: string;
  baseUrl?: string;
  defaultReleaseVersion?: string;
  variant?: YagoVariant;
  fetchImplementation?: FetchLike;
  extractImplementation?: (archivePath: string, targetDirectory: string) => Promise<void>;
}

interface IYagoManifest {
  sourceId: 'yago';
  runId: string;
  releaseVersion: string;
  variant: YagoVariant;
  upstreamUrl: string;
  fetchedAt: string;
  contentLength: number | null;
  checksum: string;
  etag: string | null;
  lastModified: string | null;
  payloadStorageKey: string;
  extractedStorageKeys: string[];
}

const DEFAULT_YAGO_BASE_URL = 'https://yago-knowledge.org/data/yago4.5/';
const DEFAULT_YAGO_RELEASE_VERSION = '4.5.0.2';

export class YagoSourceFetcher implements ISourceFetcher {
  readonly sourceId = 'yago' as const;

  private readonly artifactRootDirectory: string;
  private readonly baseUrl: string;
  private readonly defaultReleaseVersion: string;
  private readonly variant: YagoVariant;
  private readonly fetchImplementation: FetchLike;
  private readonly extractImplementation: (
    archivePath: string,
    targetDirectory: string
  ) => Promise<void>;

  constructor(
    private readonly rawArtifactStore: IRawArtifactStore,
    config: IYagoFetcherConfig
  ) {
    this.artifactRootDirectory = config.artifactRootDirectory;
    this.baseUrl = ensureTrailingSlash(config.baseUrl ?? DEFAULT_YAGO_BASE_URL);
    this.defaultReleaseVersion = config.defaultReleaseVersion ?? DEFAULT_YAGO_RELEASE_VERSION;
    this.variant = config.variant ?? 'tiny';
    this.fetchImplementation = config.fetchImplementation ?? fetch;
    this.extractImplementation = config.extractImplementation ?? extractZipArchive;
  }

  async fetch(run: IOntologyImportRun): Promise<IOntologyImportArtifact[]> {
    const releaseVersion = run.sourceVersion ?? this.defaultReleaseVersion;
    const fileName = `yago-${releaseVersion}${this.variant === 'tiny' ? '-tiny' : ''}.zip`;
    const upstreamUrl = new URL(fileName, this.baseUrl).toString();
    const payloadStorageKey = path.posix.join('ontology-imports', 'yago', run.id, fileName);

    const headMetadata = await this.fetchHeadMetadata(upstreamUrl);
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
    const extractedArtifacts = await this.extractPayload(run.id, payloadStorageKey);

    const manifest: IYagoManifest = {
      sourceId: this.sourceId,
      runId: run.id,
      releaseVersion,
      variant: this.variant,
      upstreamUrl,
      fetchedAt: new Date().toISOString(),
      contentLength: headMetadata.contentLength ?? payloadDownload.sizeBytes,
      checksum: payloadDownload.checksum,
      etag: headMetadata.etag,
      lastModified: headMetadata.lastModified,
      payloadStorageKey,
      extractedStorageKeys: extractedArtifacts.map((artifact) => artifact.storageKey),
    };

    const manifestStorageKey = path.posix.join('ontology-imports', 'yago', run.id, 'manifest.json');
    const manifestArtifact = await this.writeManifest(run.id, manifestStorageKey, manifest);

    return [payloadArtifact, ...extractedArtifacts, manifestArtifact];
  }

  private async fetchHeadMetadata(upstreamUrl: string): Promise<{
    contentLength: number | null;
    etag: string | null;
    lastModified: string | null;
  }> {
    const response = await this.fetchImplementation(upstreamUrl, {
      method: 'HEAD',
      headers: {
        'user-agent': 'noema-knowledge-graph-service/0.1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`YAGO HEAD request failed with status ${String(response.status)}`);
    }

    return {
      contentLength: parseContentLength(response.headers.get('content-length')),
      etag: normalizeEtag(response.headers.get('etag')),
      lastModified: response.headers.get('last-modified'),
    };
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
      throw new Error(`YAGO download failed with status ${String(response.status)}`);
    }

    const targetPath = path.join(this.artifactRootDirectory, storageKey);
    await mkdir(path.dirname(targetPath), { recursive: true });

    const hash = createHash('sha256');
    let sizeBytes = 0;
    const hashTransform = new Transform({
      transform(chunk, _encoding, callback) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        hash.update(buffer);
        sizeBytes += buffer.length;
        callback(null, buffer);
      },
    });

    await pipeline(
      Readable.fromWeb(response.body as globalThis.ReadableStream<Uint8Array>),
      hashTransform,
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
    storageKey: string,
    manifest: IYagoManifest
  ): Promise<IOntologyImportArtifact> {
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

  private async extractPayload(
    runId: string,
    payloadStorageKey: string
  ): Promise<IOntologyImportArtifact[]> {
    const archivePath = path.join(this.artifactRootDirectory, payloadStorageKey);
    const extractionStoragePrefix = path.posix.join('ontology-imports', 'yago', runId, 'extracted');
    const extractionDirectory = path.join(this.artifactRootDirectory, extractionStoragePrefix);

    await mkdir(extractionDirectory, { recursive: true });
    await this.extractImplementation(archivePath, extractionDirectory);

    const extractedFiles = await collectFiles(extractionDirectory);
    const persistedArtifacts: IOntologyImportArtifact[] = [];

    for (const extractedFile of extractedFiles) {
      const relativePath = path.relative(extractionDirectory, extractedFile);
      const storageKey = path.posix.join(
        extractionStoragePrefix,
        relativePath.split(path.sep).join(path.posix.sep)
      );
      const buffer = await readFile(extractedFile);
      persistedArtifacts.push(
        await this.rawArtifactStore.saveArtifact({
          runId,
          sourceId: this.sourceId,
          kind: 'raw_payload',
          storageKey,
          contentType: inferContentType(extractedFile),
          checksum: createHash('sha256').update(buffer).digest('hex'),
          sizeBytes: buffer.byteLength,
        })
      );
    }

    return persistedArtifacts;
  }
}

const execFileAsync = promisify(execFile);

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function parseContentLength(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeEtag(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  return value.replaceAll('"', '');
}

async function extractZipArchive(archivePath: string, targetDirectory: string): Promise<void> {
  const attempts: (() => Promise<void>)[] = [
    async () => {
      await execFileAsync('tar', ['-xf', archivePath, '-C', targetDirectory]);
    },
    async () => {
      await execFileAsync('powershell', [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${escapePowerShellLiteral(archivePath)}' -DestinationPath '${escapePowerShellLiteral(targetDirectory)}' -Force`,
      ]);
    },
  ];

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      await attempt();
      return;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown extraction failure.');
    }
  }

  throw new Error(`Unable to extract YAGO archive. ${errors.join(' | ')}`);
}

async function collectFiles(rootDirectory: string): Promise<string[]> {
  const entries = await readdir(rootDirectory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(rootDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath)));
      continue;
    }

    const metadata = await stat(absolutePath);
    if (metadata.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

function inferContentType(filePath: string): string | null {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.ttl') return 'text/turtle';
  if (extension === '.nt') return 'application/n-triples';
  if (extension === '.nq') return 'application/n-quads';
  if (extension === '.tsv') return 'text/tab-separated-values';
  if (extension === '.txt') return 'text/plain';
  return null;
}

function escapePowerShellLiteral(value: string): string {
  return value.replaceAll("'", "''");
}
