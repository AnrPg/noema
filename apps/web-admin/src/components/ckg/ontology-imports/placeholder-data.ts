import type {
  IOntologyImportRunDetailDto,
  IOntologyImportRunDto,
  IOntologyImportSourceDto,
} from '@noema/api-client';

const now = '2026-03-24T09:00:00.000Z';

const yagoSource: IOntologyImportSourceDto = {
  id: 'yago',
  name: 'YAGO',
  role: 'backbone',
  accessMode: 'snapshot',
  description:
    'Broad world-knowledge backbone imported as reproducible snapshot releases for taxonomy and entity structure.',
  homepageUrl: 'https://yago-knowledge.org/',
  documentationUrl: 'https://yago-knowledge.org/downloads/yago-4-5',
  supportedLanguages: ['en'],
  supportsIncremental: false,
  enabled: true,
  latestRelease: {
    version: 'pilot-snapshot',
    publishedAt: null,
    checksum: null,
  },
  createdAt: now,
  updatedAt: now,
};

const escoSource: IOntologyImportSourceDto = {
  id: 'esco',
  name: 'ESCO',
  role: 'backbone',
  accessMode: 'linked_data',
  description:
    'European skills and occupations taxonomy, used as a structured skills backbone for learning paths and competency gaps.',
  homepageUrl: 'https://esco.ec.europa.eu/',
  documentationUrl: 'https://esco.ec.europa.eu/en/about-esco/escopedia/escopedia/linked-open-data',
  supportedLanguages: ['en', 'fr', 'de', 'es'],
  supportsIncremental: true,
  enabled: true,
  latestRelease: {
    version: 'pilot-linked-data',
    publishedAt: null,
    checksum: null,
  },
  createdAt: now,
  updatedAt: now,
};

const conceptNetSource: IOntologyImportSourceDto = {
  id: 'conceptnet',
  name: 'ConceptNet',
  role: 'backbone',
  accessMode: 'hybrid',
  description:
    'Commonsense relation graph for everyday conceptual links, helpful for prerequisite hints and gap debugging.',
  homepageUrl: 'https://conceptnet.io/',
  documentationUrl: 'https://github.com/commonsense/conceptnet5/wiki',
  supportedLanguages: ['en', 'multilingual'],
  supportsIncremental: true,
  enabled: true,
  latestRelease: {
    version: 'pilot-hybrid',
    publishedAt: null,
    checksum: null,
  },
  createdAt: now,
  updatedAt: now,
};

export const ontologyImportSourcesPlaceholder: IOntologyImportSourceDto[] = [
  yagoSource,
  escoSource,
  conceptNetSource,
];

const yagoRun: IOntologyImportRunDto = {
  id: 'run_yago_seed_001',
  sourceId: 'yago',
  sourceName: 'YAGO',
  sourceVersion: 'pilot-snapshot',
  configuration: {
    mode: 'snapshot',
    language: null,
    seedNodes: [],
  },
  submittedMutationIds: [],
  status: 'queued',
  trigger: 'manual',
  initiatedBy: 'admin',
  createdAt: now,
  updatedAt: now,
  startedAt: null,
  completedAt: null,
  failureReason: null,
};

const escoRun: IOntologyImportRunDto = {
  id: 'run_esco_seed_001',
  sourceId: 'esco',
  sourceName: 'ESCO',
  sourceVersion: 'pilot-linked-data',
  configuration: {
    mode: 'skills',
    language: 'en',
    seedNodes: [],
  },
  submittedMutationIds: ['mutation_seed_esco_001', 'mutation_seed_esco_002'],
  status: 'review_submitted',
  trigger: 'manual',
  initiatedBy: 'admin',
  createdAt: now,
  updatedAt: now,
  startedAt: '2026-03-24T09:10:00.000Z',
  completedAt: '2026-03-24T09:18:00.000Z',
  failureReason: null,
};

export const ontologyImportRunsPlaceholder: IOntologyImportRunDto[] = [yagoRun, escoRun];

export const ontologyImportRunDetailsPlaceholder: Record<string, IOntologyImportRunDetailDto> = {
  run_yago_seed_001: {
    run: yagoRun,
    source: yagoSource,
    artifacts: [],
    checkpoints: [
      {
        id: 'checkpoint_yago_fetch',
        runId: 'run_yago_seed_001',
        step: 'fetch',
        status: 'pending',
        startedAt: null,
        completedAt: null,
        detail: 'Waiting for the first bulk snapshot fetch worker.',
      },
    ],
    parsedBatch: null,
    normalizedBatch: null,
    mutationPreview: null,
  },
  run_esco_seed_001: {
    run: escoRun,
    source: escoSource,
    artifacts: [
      {
        id: 'artifact_esco_manifest_001',
        runId: 'run_esco_seed_001',
        sourceId: 'esco',
        kind: 'manifest',
        storageKey: 'ontology-imports/esco/run_esco_seed_001/manifest.json',
        contentType: 'application/json',
        checksum: null,
        sizeBytes: 4821,
        createdAt: '2026-03-24T09:11:00.000Z',
      },
    ],
    checkpoints: [
      {
        id: 'checkpoint_esco_fetch',
        runId: 'run_esco_seed_001',
        step: 'fetch',
        status: 'completed',
        startedAt: '2026-03-24T09:10:00.000Z',
        completedAt: '2026-03-24T09:12:00.000Z',
        detail: 'Linked-data payload fetched successfully.',
      },
      {
        id: 'checkpoint_esco_parse',
        runId: 'run_esco_seed_001',
        step: 'parse',
        status: 'completed',
        startedAt: '2026-03-24T09:12:00.000Z',
        completedAt: '2026-03-24T09:15:00.000Z',
        detail: 'Parsed into staging-compatible records.',
      },
      {
        id: 'checkpoint_esco_validation',
        runId: 'run_esco_seed_001',
        step: 'validation',
        status: 'completed',
        startedAt: '2026-03-24T09:15:00.000Z',
        completedAt: '2026-03-24T09:18:00.000Z',
        detail: 'Batch is normalized and ready for mutation-review inspection.',
      },
    ],
    parsedBatch: {
      runId: 'run_esco_seed_001',
      sourceId: 'esco',
      sourceVersion: 'pilot-linked-data',
      recordCount: 1240,
      artifactId: 'artifact_esco_manifest_001',
    },
    normalizedBatch: {
      runId: 'run_esco_seed_001',
      sourceId: 'esco',
      sourceVersion: 'pilot-linked-data',
      artifactId: 'artifact_esco_normalized_001',
      generatedAt: '2026-03-24T09:16:00.000Z',
      rawRecordCount: 1240,
      conceptCount: 810,
      relationCount: 280,
      mappingCount: 150,
    },
    mutationPreview: {
      runId: 'run_esco_seed_001',
      sourceId: 'esco',
      sourceVersion: 'pilot-linked-data',
      generatedAt: '2026-03-24T09:17:00.000Z',
      artifactId: 'artifact_esco_mutation_preview_001',
      proposalCount: 3,
      readyProposalCount: 3,
      blockedCandidateCount: 2,
      candidates: [
        {
          candidateId: 'concept:skill:bioinformatics',
          entityKind: 'concept',
          status: 'ready',
          title: 'Add concept: Bioinformatics',
          summary: 'Create a canonical concept node from ESCO.',
          rationale:
            'Import "Bioinformatics" from ESCO as a canonical node with preserved source provenance.',
          review: {
            confidenceScore: 0.82,
            confidenceBand: 'high',
            conflictFlags: [],
          },
          blockedReason: null,
          dependencyExternalIds: [],
          proposal: {
            operations: [
              {
                type: 'add_node',
                nodeType: 'concept',
                label: 'Bioinformatics',
                description: 'Interdisciplinary computational analysis of biological data.',
                domain: 'skills-and-occupations',
                properties: {
                  ontologyImport: {
                    sourceId: 'esco',
                    externalId: 'skill:bioinformatics',
                  },
                },
              },
            ],
            rationale:
              'Import "Bioinformatics" from ESCO as a canonical node with preserved source provenance.',
            evidenceCount: 1,
            priority: 10,
          },
        },
        {
          candidateId: 'relation:skill:bioinformatics::related_to::skill:data-analysis',
          entityKind: 'relation',
          status: 'blocked',
          title: 'Defer relation: related_to',
          summary: 'skill:bioinformatics related_to skill:data-analysis',
          rationale:
            'Wait for imported concepts to resolve against canonical CKG nodes before emitting add_edge mutations.',
          review: {
            confidenceScore: 0.48,
            confidenceBand: 'low',
            conflictFlags: ['weak_mapping_only'],
          },
          blockedReason:
            'CKG edge mutations need canonical node ids. This import batch only has source external ids, so relation proposals stay deferred until node resolution is available.',
          dependencyExternalIds: ['skill:bioinformatics', 'skill:data-analysis'],
          proposal: null,
        },
      ],
    },
  },
};

export function getOntologyImportPlaceholderRunDetail(
  runId: string
): IOntologyImportRunDetailDto | null {
  return ontologyImportRunDetailsPlaceholder[runId] ?? null;
}
