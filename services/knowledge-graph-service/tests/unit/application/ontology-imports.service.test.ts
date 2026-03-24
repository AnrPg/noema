import { describe, expect, it } from 'vitest';
import type {
  ICanonicalNodeResolver,
  ICancelOntologyImportRunInput,
  ICreateOntologyImportRunInput,
  IImportArtifactRepository,
  IImportCheckpointRepository,
  IImportRunRepository,
  INormalizedOntologyGraphBatch,
  INormalizationPublisher,
  IParsedBatchRepository,
  IParsedOntologyGraphBatch,
  IRawArtifactStore,
  IRegisterOntologySourceInput,
  IRetryOntologyImportRunInput,
  ISourceCatalogRepository,
  ISourceFetcher,
  ISourceNormalizer,
  ISourceParser,
  IOntologyImportArtifact,
  IOntologyImportCheckpoint,
  IOntologyImportRun,
  IOntologySource,
  IParsedOntologyBatch,
} from '../../../src/domain/knowledge-graph-service/ontology-imports.contracts.js';
import type { IExecutionContext } from '../../../src/domain/knowledge-graph-service/execution-context.js';
import {
  NoopNormalizationPublisher,
  OntologyImportsApplicationService,
} from '../../../src/application/knowledge-graph/ontology-imports/service.js';

class InMemorySourceRepository implements ISourceCatalogRepository {
  constructor(private readonly sources: IOntologySource[]) {}

  list(): Promise<IOntologySource[]> {
    return Promise.resolve(this.sources);
  }

  getById(sourceId: string): Promise<IOntologySource | null> {
    return Promise.resolve(this.sources.find((source) => source.id === sourceId) ?? null);
  }

  register(source: IRegisterOntologySourceInput): Promise<IOntologySource> {
    const registered: IOntologySource = {
      ...source,
      homepageUrl: source.homepageUrl ?? null,
      documentationUrl: source.documentationUrl ?? null,
      supportedLanguages: source.supportedLanguages ?? [],
      supportsIncremental: source.supportsIncremental ?? false,
      enabled: true,
      latestRelease: null,
      createdAt: '2026-03-24T12:00:00.000Z',
      updatedAt: '2026-03-24T12:00:00.000Z',
    };
    this.sources.push(registered);
    return Promise.resolve(registered);
  }
}

class InMemoryRunRepository implements IImportRunRepository {
  constructor(private readonly runs: IOntologyImportRun[]) {}

  list(): Promise<IOntologyImportRun[]> {
    return Promise.resolve(this.runs);
  }

  getById(runId: string): Promise<IOntologyImportRun | null> {
    return Promise.resolve(this.runs.find((run) => run.id === runId) ?? null);
  }

  create(input: ICreateOntologyImportRunInput): Promise<IOntologyImportRun> {
    const created: IOntologyImportRun = {
      id: 'run_created_001',
      sourceId: input.sourceId,
      sourceVersion: input.sourceVersion ?? null,
      configuration: {
        mode: input.configuration?.mode ?? null,
        language: input.configuration?.language ?? null,
        seedNodes: input.configuration?.seedNodes ?? [],
      },
      submittedMutationIds: [],
      status: 'queued',
      trigger: input.trigger,
      initiatedBy: input.initiatedBy ?? null,
      createdAt: '2026-03-24T12:00:00.000Z',
      updatedAt: '2026-03-24T12:00:00.000Z',
      startedAt: null,
      completedAt: null,
      failureReason: null,
    };
    this.runs.push(created);
    return Promise.resolve(created);
  }

  updateStatus(
    runId: string,
    status: IOntologyImportRun['status'],
    options?: {
      failureReason?: string;
      startedAt?: string | null;
      completedAt?: string | null;
    }
  ): Promise<IOntologyImportRun> {
    const run = this.runs.find((entry) => entry.id === runId);
    if (run === undefined) {
      throw new Error(`Run ${runId} not found`);
    }

    const updated: IOntologyImportRun = {
      ...run,
      status,
      failureReason: options?.failureReason ?? null,
      startedAt: options?.startedAt ?? run.startedAt,
      completedAt: options?.completedAt ?? run.completedAt,
      updatedAt: '2026-03-24T12:05:00.000Z',
    };
    this.runs.splice(this.runs.indexOf(run), 1, updated);
    return Promise.resolve(updated);
  }

  cancel(input: ICancelOntologyImportRunInput): Promise<IOntologyImportRun> {
    return this.updateStatus(input.runId, 'cancelled', {
      failureReason: input.reason,
      completedAt: '2026-03-24T12:05:00.000Z',
    });
  }

  retry(input: IRetryOntologyImportRunInput): Promise<IOntologyImportRun> {
    return this.updateStatus(input.runId, 'queued', {
      failureReason: input.reason,
      startedAt: null,
      completedAt: null,
    });
  }

  recordSubmittedMutations(runId: string, mutationIds: string[]): Promise<IOntologyImportRun> {
    const run = this.runs.find((entry) => entry.id === runId);
    if (run === undefined) {
      throw new Error(`Run ${runId} not found`);
    }

    const updated: IOntologyImportRun = {
      ...run,
      submittedMutationIds: mutationIds,
      updatedAt: '2026-03-24T12:05:00.000Z',
    };
    this.runs.splice(this.runs.indexOf(run), 1, updated);
    return Promise.resolve(updated);
  }
}

class InMemoryArtifactRepository implements IImportArtifactRepository {
  private readonly artifacts: IOntologyImportArtifact[] = [];

  listByRunId(runId: string): Promise<IOntologyImportArtifact[]> {
    return Promise.resolve(this.artifacts.filter((artifact) => artifact.runId === runId));
  }

  create(
    artifact: Omit<IOntologyImportArtifact, 'id' | 'createdAt'>
  ): Promise<IOntologyImportArtifact> {
    const created: IOntologyImportArtifact = {
      ...artifact,
      id: `artifact_${String(this.artifacts.length + 1)}`,
      createdAt: '2026-03-24T12:00:00.000Z',
    };
    this.artifacts.push(created);
    return Promise.resolve(created);
  }
}

class InMemoryCheckpointRepository implements IImportCheckpointRepository {
  readonly checkpoints: IOntologyImportCheckpoint[] = [];

  listByRunId(runId: string): Promise<IOntologyImportCheckpoint[]> {
    return Promise.resolve(this.checkpoints.filter((checkpoint) => checkpoint.runId === runId));
  }

  create(checkpoint: Omit<IOntologyImportCheckpoint, 'id'>): Promise<IOntologyImportCheckpoint> {
    const created: IOntologyImportCheckpoint = {
      ...checkpoint,
      id: `checkpoint_${String(this.checkpoints.length + 1)}`,
    };
    this.checkpoints.push(created);
    return Promise.resolve(created);
  }
}

class InMemoryParsedBatchRepository implements IParsedBatchRepository {
  private batch: IParsedOntologyBatch | null = null;

  getByRunId(): Promise<IParsedOntologyBatch | null> {
    return Promise.resolve(this.batch);
  }

  save(batch: IParsedOntologyBatch): Promise<IParsedOntologyBatch> {
    this.batch = batch;
    return Promise.resolve(batch);
  }
}

class InMemoryRawArtifactStore implements IRawArtifactStore {
  private readonly payloads = new Map<string, Buffer>();
  private sequence = 0;

  constructor(private readonly artifactRepository?: InMemoryArtifactRepository) {}

  saveArtifact(
    artifact: Omit<IOntologyImportArtifact, 'id' | 'createdAt'>
  ): Promise<IOntologyImportArtifact> {
    if (this.artifactRepository !== undefined) {
      return this.artifactRepository.create(artifact);
    }

    this.sequence += 1;
    return Promise.resolve({
      ...artifact,
      id: `artifact_${String(this.sequence)}`,
      createdAt: '2026-03-24T12:00:00.000Z',
    });
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

  getArtifact(storageKey: string): Promise<IOntologyImportArtifact | null> {
    if (this.artifactRepository === undefined) {
      return Promise.resolve(null);
    }

    return this.artifactRepository
      .listByRunId('run_test_001')
      .then(
        (artifacts) => artifacts.find((artifact) => artifact.storageKey === storageKey) ?? null
      );
  }

  readPayload(storageKey: string): Promise<Buffer> {
    const payload = this.payloads.get(storageKey);
    if (payload === undefined) {
      throw new Error(`Missing payload for ${storageKey}`);
    }
    return Promise.resolve(payload);
  }
}

class StubSourceFetcher implements ISourceFetcher {
  readonly sourceId = 'yago';

  fetch(run: IOntologyImportRun): Promise<IOntologyImportArtifact[]> {
    return Promise.resolve([
      {
        id: 'artifact_001',
        runId: run.id,
        sourceId: 'yago',
        kind: 'raw_payload',
        storageKey: 'ontology-imports/yago/run_test/payload.zip',
        contentType: 'application/zip',
        checksum: 'checksum',
        sizeBytes: 4,
        createdAt: '2026-03-24T12:00:00.000Z',
      },
      {
        id: 'artifact_002',
        runId: run.id,
        sourceId: 'yago',
        kind: 'manifest',
        storageKey: 'ontology-imports/yago/run_test/manifest.json',
        contentType: 'application/json',
        checksum: 'checksum',
        sizeBytes: 4,
        createdAt: '2026-03-24T12:00:00.000Z',
      },
    ]);
  }
}

class StubCanonicalNodeResolver implements ICanonicalNodeResolver {
  resolveConcept(concept: { externalId: string; preferredLabel: string }): Promise<{
    resolution: {
      nodeId: string;
      label: string;
      nodeType: string;
      domain: string;
      strategy: 'external_id' | 'label';
      confidenceScore: number;
      confidenceBand: 'high' | 'medium' | 'low';
      conflictFlags: [];
    } | null;
    conflictFlags: [];
  }> {
    if (concept.preferredLabel === 'Leonhard Euler') {
      return Promise.resolve({
        resolution: {
          nodeId: 'node_euler',
          label: 'Leonhard Euler',
          nodeType: 'concept',
          domain: 'world-knowledge',
          strategy: 'label',
          confidenceScore: 0.92,
          confidenceBand: 'high',
          conflictFlags: [],
        },
        conflictFlags: [],
      });
    }

    return Promise.resolve({
      resolution: null,
      conflictFlags: [],
    });
  }
}

class StubMutationSubmissionPort {
  readonly submissions: string[] = [];

  submitProposal(
    _proposal: {
      operations: unknown[];
      rationale: string;
      evidenceCount: number;
      priority: number;
    },
    _context: IExecutionContext
  ): Promise<{ mutationId: string }> {
    const mutationId = `mutation_${String(this.submissions.length + 1)}`;
    this.submissions.push(mutationId);
    return Promise.resolve({ mutationId });
  }
}

class StubSourceParser implements ISourceParser {
  readonly sourceId = 'yago';

  parse(run: IOntologyImportRun): Promise<IParsedOntologyGraphBatch> {
    return Promise.resolve({
      runId: run.id,
      sourceId: run.sourceId,
      sourceVersion: run.sourceVersion,
      generatedAt: '2026-03-24T12:01:00.000Z',
      records: [
        {
          recordKind: 'concept',
          externalId: 'https://yago-knowledge.org/resource/Leonhard_Euler',
          iri: 'https://yago-knowledge.org/resource/Leonhard_Euler',
          nodeKind: 'entity',
          preferredLabel: 'Leonhard Euler',
          altLabels: [],
          description: null,
          languages: ['en'],
          sourceTypes: ['yago_resource'],
          properties: {},
          provenance: {
            sourceId: run.sourceId,
            sourceVersion: run.sourceVersion,
            runId: run.id,
            artifactId: 'artifact_001',
            harvestedAt: '2026-03-24T12:00:00.000Z',
            license: null,
            requestUrl: null,
          },
        },
      ],
    });
  }
}

class StubSourceNormalizer implements ISourceNormalizer {
  readonly sourceId = 'yago';

  normalize(batch: IParsedOntologyGraphBatch): Promise<INormalizedOntologyGraphBatch> {
    return Promise.resolve({
      runId: batch.runId,
      sourceId: batch.sourceId,
      sourceVersion: batch.sourceVersion,
      generatedAt: '2026-03-24T12:02:00.000Z',
      rawRecordCount: batch.records.length,
      conceptCount: 1,
      relationCount: 0,
      mappingCount: 0,
      concepts: [
        {
          externalId: 'https://yago-knowledge.org/resource/Leonhard_Euler',
          iri: 'https://yago-knowledge.org/resource/Leonhard_Euler',
          nodeKind: 'entity',
          preferredLabel: 'Leonhard Euler',
          aliases: [],
          description: null,
          languages: ['en'],
          sourceTypes: ['yago_resource'],
          properties: {},
          provenance: [],
        },
      ],
      relations: [],
      mappings: [],
    });
  }
}

function createRun(sourceId: string): IOntologyImportRun {
  return {
    id: 'run_test_001',
    sourceId,
    sourceVersion: null,
    status: 'queued',
    trigger: 'manual',
    configuration: {
      mode: null,
      language: null,
      seedNodes: [],
    },
    submittedMutationIds: [],
    initiatedBy: 'admin',
    createdAt: '2026-03-24T12:00:00.000Z',
    updatedAt: '2026-03-24T12:00:00.000Z',
    startedAt: null,
    completedAt: null,
    failureReason: null,
  };
}

function createSource(sourceId: string): IOntologySource {
  return {
    id: sourceId,
    name: sourceId.toUpperCase(),
    role: 'backbone',
    accessMode: 'snapshot',
    description: `${sourceId} source`,
    homepageUrl: null,
    documentationUrl: null,
    supportedLanguages: ['en'],
    supportsIncremental: false,
    enabled: true,
    latestRelease: null,
    createdAt: '2026-03-24T12:00:00.000Z',
    updatedAt: '2026-03-24T12:00:00.000Z',
  };
}

function createService(
  run: IOntologyImportRun,
  source: IOntologySource,
  sourceFetchers: ISourceFetcher[] = [],
  sourceParsers: ISourceParser[] = [],
  sourceNormalizers: ISourceNormalizer[] = [],
  options?: {
    canonicalNodeResolver?: ICanonicalNodeResolver;
    mutationSubmissionPort?: StubMutationSubmissionPort;
  }
): {
  service: OntologyImportsApplicationService;
  checkpointRepository: InMemoryCheckpointRepository;
  rawArtifactStore: InMemoryRawArtifactStore;
  parsedBatchRepository: InMemoryParsedBatchRepository;
  mutationSubmissionPort: StubMutationSubmissionPort;
} {
  const checkpointRepository = new InMemoryCheckpointRepository();
  const parsedBatchRepository = new InMemoryParsedBatchRepository();
  const artifactRepository = new InMemoryArtifactRepository();
  const rawArtifactStore = new InMemoryRawArtifactStore(artifactRepository);

  const mutationSubmissionPort =
    options?.mutationSubmissionPort ?? new StubMutationSubmissionPort();

  return {
    service: new OntologyImportsApplicationService(
      new InMemorySourceRepository([source]),
      new InMemoryRunRepository([run]),
      artifactRepository,
      checkpointRepository,
      parsedBatchRepository,
      new NoopNormalizationPublisher() as INormalizationPublisher,
      rawArtifactStore,
      sourceFetchers,
      sourceParsers,
      sourceNormalizers,
      {
        canonicalNodeResolver: options?.canonicalNodeResolver,
        mutationSubmissionPort,
      }
    ),
    checkpointRepository,
    rawArtifactStore,
    parsedBatchRepository,
    mutationSubmissionPort,
  };
}

describe('OntologyImportsApplicationService.startImportRun', () => {
  it('completes the fetch stage when a source fetcher is registered', async () => {
    const { service, checkpointRepository, parsedBatchRepository } = createService(
      createRun('yago'),
      createSource('yago'),
      [new StubSourceFetcher()],
      [new StubSourceParser()],
      [new StubSourceNormalizer()],
      {
        canonicalNodeResolver: new StubCanonicalNodeResolver(),
      }
    );

    const run = await service.startImportRun({ runId: 'run_test_001' });

    expect(run.status).toBe('ready_for_normalization');
    await expect(parsedBatchRepository.getByRunId()).resolves.toEqual(
      expect.objectContaining({
        runId: 'run_test_001',
        sourceId: 'yago',
        recordCount: 1,
      })
    );
    expect(checkpointRepository.checkpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runId: 'run_test_001',
          step: 'fetch',
          status: 'completed',
        }),
        expect.objectContaining({
          runId: 'run_test_001',
          step: 'parse',
          status: 'completed',
        }),
        expect.objectContaining({
          runId: 'run_test_001',
          step: 'stage',
          status: 'completed',
        }),
      ])
    );

    const detail = await service.getImportRun('run_test_001');
    expect(detail?.normalizedBatch).toEqual(
      expect.objectContaining({
        runId: 'run_test_001',
        conceptCount: 1,
        relationCount: 0,
      })
    );
    expect(detail?.mutationPreview).toEqual(
      expect.objectContaining({
        readyProposalCount: 1,
        blockedCandidateCount: 0,
      })
    );
  });

  it('keeps the run in fetching state when no source fetcher is registered yet', async () => {
    const { service, checkpointRepository } = createService(
      createRun('conceptnet'),
      createSource('conceptnet')
    );

    const run = await service.startImportRun({ runId: 'run_test_001' });

    expect(run.status).toBe('fetching');
    expect(checkpointRepository.checkpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runId: 'run_test_001',
          step: 'fetch',
          status: 'running',
        }),
      ])
    );
  });
});

describe('OntologyImportsApplicationService.submitMutationPreview', () => {
  it('submits ready preview candidates into the CKG review queue', async () => {
    const { service, mutationSubmissionPort, checkpointRepository } = createService(
      createRun('yago'),
      createSource('yago'),
      [new StubSourceFetcher()],
      [new StubSourceParser()],
      [new StubSourceNormalizer()],
      {
        canonicalNodeResolver: new StubCanonicalNodeResolver(),
      }
    );

    await service.startImportRun({ runId: 'run_test_001' });
    const submission = await service.submitMutationPreview({
      runId: 'run_test_001',
      context: {
        userId: 'user_admin',
        correlationId: 'cor_test',
        roles: ['admin'],
        clientIp: '127.0.0.1',
      },
    });

    expect(submission).toEqual(
      expect.objectContaining({
        runId: 'run_test_001',
        submittedCount: 1,
        mutationIds: ['mutation_1'],
      })
    );
    expect(mutationSubmissionPort.submissions).toEqual(['mutation_1']);
    expect(checkpointRepository.checkpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runId: 'run_test_001',
          step: 'validation',
          status: 'completed',
        }),
      ])
    );

    const detail = await service.getImportRun('run_test_001');
    expect(detail?.run.submittedMutationIds).toEqual(['mutation_1']);
  });
});
