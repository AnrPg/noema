/**
 * @noema/knowledge-graph-service - ESCO Source Fetcher
 *
 * Linked-data / web-service fetcher for ESCO concept collections. It pages
 * through the official ESCO REST API, stores the source-native JSON payloads as
 * immutable raw artifacts, and emits a manifest with provenance metadata for
 * the run.
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  IOntologyImportArtifact,
  IOntologyImportRun,
  IRawArtifactStore,
  ISourceFetcher,
} from '../../../../domain/knowledge-graph-service/ontology-imports.contracts.js';

type FetchLike = typeof fetch;

interface IEscoSchemeConfig {
  id: string;
  endpointPath: string;
  conceptSchemeUri: string;
}

interface IEscoFetcherConfig {
  artifactRootDirectory: string;
  baseUrl?: string;
  language?: string;
  pageSize?: number;
  defaultSelectedVersion?: string | null;
  includeObsolete?: boolean;
  fetchImplementation?: FetchLike;
  schemes?: IEscoSchemeConfig[];
}

interface IEscoManifestPage {
  schemeId: string;
  page: number;
  requestUrl: string;
  storageKey: string;
  recordCount: number;
  checksum: string;
}

interface IEscoManifest {
  sourceId: 'esco';
  runId: string;
  selectedVersion: string | null;
  language: string;
  includeObsolete: boolean;
  mode: string;
  pageSize: number;
  fetchedAt: string;
  pages: IEscoManifestPage[];
  totalPages: number;
  totalRecords: number;
}

const DEFAULT_ESCO_BASE_URL = 'https://ec.europa.eu/esco/api/';
const DEFAULT_LANGUAGE = 'en';
// The live ESCO API starts returning 500s on larger page sizes.
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_SCHEMES: IEscoSchemeConfig[] = [
  {
    id: 'occupations',
    endpointPath: '/resource/occupation',
    conceptSchemeUri: 'http://data.europa.eu/esco/concept-scheme/occupations',
  },
  {
    id: 'skills',
    endpointPath: '/resource/skill',
    conceptSchemeUri: 'http://data.europa.eu/esco/concept-scheme/skills',
  },
  {
    id: 'qualifications',
    endpointPath: '/resource/concept',
    conceptSchemeUri: 'http://data.europa.eu/esco/concept-scheme/qualifications',
  },
];

export class EscoSourceFetcher implements ISourceFetcher {
  readonly sourceId = 'esco' as const;

  private readonly artifactRootDirectory: string;
  private readonly baseUrl: string;
  private readonly language: string;
  private readonly pageSize: number;
  private readonly defaultSelectedVersion: string | null;
  private readonly includeObsolete: boolean;
  private readonly fetchImplementation: FetchLike;
  private readonly schemes: IEscoSchemeConfig[];

  constructor(
    private readonly rawArtifactStore: IRawArtifactStore,
    config: IEscoFetcherConfig
  ) {
    this.artifactRootDirectory = config.artifactRootDirectory;
    this.baseUrl = ensureTrailingSlash(config.baseUrl ?? DEFAULT_ESCO_BASE_URL);
    this.language = config.language ?? DEFAULT_LANGUAGE;
    this.pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE;
    this.defaultSelectedVersion = config.defaultSelectedVersion ?? null;
    this.includeObsolete = config.includeObsolete ?? false;
    this.fetchImplementation = config.fetchImplementation ?? fetch;
    this.schemes = config.schemes ?? DEFAULT_SCHEMES;
  }

  async fetch(run: IOntologyImportRun): Promise<IOntologyImportArtifact[]> {
    const selectedVersion = run.sourceVersion ?? this.defaultSelectedVersion;
    const configuration = readRunConfiguration(run);
    const language = configuration.language ?? this.language;
    const requestedMode = configuration.mode;
    const schemes = selectSchemes(this.schemes, requestedMode);
    const fetchedAt = new Date().toISOString();
    const payloadArtifacts: IOntologyImportArtifact[] = [];
    const manifestPages: IEscoManifestPage[] = [];

    for (const scheme of schemes) {
      const pages = await this.fetchSchemePages(run, scheme, selectedVersion, language);
      payloadArtifacts.push(...pages.artifacts);
      manifestPages.push(...pages.manifestPages);
    }

    const manifest: IEscoManifest = {
      sourceId: this.sourceId,
      runId: run.id,
      selectedVersion,
      language,
      includeObsolete: this.includeObsolete,
      mode: requestedMode ?? 'full',
      pageSize: this.pageSize,
      fetchedAt,
      pages: manifestPages,
      totalPages: manifestPages.length,
      totalRecords: manifestPages.reduce((sum, page) => sum + page.recordCount, 0),
    };

    const manifestStorageKey = path.posix.join('ontology-imports', 'esco', run.id, 'manifest.json');
    const manifestArtifact = await this.writeManifest(run.id, manifestStorageKey, manifest);

    return [...payloadArtifacts, manifestArtifact];
  }

  private async fetchSchemePages(
    run: IOntologyImportRun,
    scheme: IEscoSchemeConfig,
    selectedVersion: string | null,
    language: string
  ): Promise<{
    artifacts: IOntologyImportArtifact[];
    manifestPages: IEscoManifestPage[];
  }> {
    const artifacts: IOntologyImportArtifact[] = [];
    const manifestPages: IEscoManifestPage[] = [];

    for (let page = 0; ; page += 1) {
      const requestUrl = this.buildRequestUrl(scheme, page, selectedVersion, language);
      const response = await this.fetchImplementation(requestUrl, {
        headers: {
          accept: 'application/json,application/json;charset=UTF-8',
          'user-agent': 'noema-knowledge-graph-service/0.1.0',
        },
      });

      if (!response.ok) {
        throw new Error(
          `ESCO fetch failed for ${scheme.id} page ${String(page)} with status ${String(response.status)}`
        );
      }

      const body = await response.text();
      const payload = JSON.parse(body) as unknown;
      const recordCount = countPayloadItems(payload);
      if (recordCount === 0) {
        break;
      }

      const storageKey = path.posix.join(
        'ontology-imports',
        'esco',
        run.id,
        scheme.id,
        `page-${String(page)}.json`
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

      artifacts.push(artifact);
      manifestPages.push({
        schemeId: scheme.id,
        page,
        requestUrl,
        storageKey,
        recordCount,
        checksum,
      });

      if (recordCount < this.pageSize) {
        break;
      }
    }

    return { artifacts, manifestPages };
  }

  private buildRequestUrl(
    scheme: IEscoSchemeConfig,
    page: number,
    selectedVersion: string | null,
    language: string
  ): string {
    const url = new URL(trimLeadingSlash(scheme.endpointPath), this.baseUrl);
    url.searchParams.set('isInScheme', scheme.conceptSchemeUri);
    url.searchParams.set('language', language);
    url.searchParams.set('offset', String(page * this.pageSize));
    url.searchParams.set('limit', String(this.pageSize));
    url.searchParams.set('viewObsolete', String(this.includeObsolete));

    if (selectedVersion !== null) {
      url.searchParams.set('selectedVersion', selectedVersion);
    }

    return url.toString();
  }

  private async writeManifest(
    runId: string,
    storageKey: string,
    manifest: IEscoManifest
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
}

function countPayloadItems(payload: unknown): number {
  if (typeof payload !== 'object' || payload === null) {
    return 0;
  }

  const record = payload as Record<string, unknown>;

  if (typeof record['count'] === 'number' && Number.isFinite(record['count'])) {
    return record['count'];
  }

  if (Array.isArray(record['concepts'])) {
    return record['concepts'].length;
  }

  if (typeof record['_embedded'] !== 'object' || record['_embedded'] === null) {
    return 0;
  }

  return Object.values(record['_embedded'] as Record<string, unknown>).reduce<number>(
    (count, value) => {
      if (Array.isArray(value)) {
        return count + value.length;
      }

      if (typeof value === 'object' && value !== null) {
        return count + 1;
      }

      return count;
    },
    0
  );
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

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function trimLeadingSlash(value: string): string {
  return value.startsWith('/') ? value.slice(1) : value;
}

function selectSchemes(
  schemes: IEscoSchemeConfig[],
  requestedMode: string | null
): IEscoSchemeConfig[] {
  if (requestedMode === null || requestedMode === '' || requestedMode === 'full') {
    return schemes;
  }

  const selected = schemes.filter((scheme) => scheme.id === requestedMode);
  return selected.length > 0 ? selected : schemes;
}
