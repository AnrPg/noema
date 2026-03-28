import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  IOntologyImportArtifact,
  IOntologyImportRun,
} from '../../../src/domain/knowledge-graph-service/ontology-imports.contracts.js';
import {
  ConceptNetSourceParser,
  EscoSourceParser,
  extractGeoNamesMappings,
  extractOpenAlexMappings,
  YagoSourceParser,
} from '../../../src/infrastructure/ontology-imports/index.js';
import { OntologyImportParsingService } from '../../../src/application/knowledge-graph/ontology-imports/parsing/index.js';

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (target) => {
      await rm(target, { recursive: true, force: true });
    })
  );
});

function buildRun(sourceId: string, sourceVersion: string | null = null): IOntologyImportRun {
  return {
    id: `run_${sourceId}_001`,
    sourceId,
    sourceVersion,
    status: 'fetched',
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
    startedAt: '2026-03-24T12:00:00.000Z',
    completedAt: null,
    failureReason: null,
  };
}

function buildArtifact(overrides: Partial<IOntologyImportArtifact>): IOntologyImportArtifact {
  return {
    id: 'artifact_001',
    runId: 'run_default_001',
    sourceId: 'yago',
    kind: 'raw_payload',
    storageKey: 'ontology-imports/default/payload.txt',
    contentType: 'text/plain',
    checksum: 'checksum',
    sizeBytes: 0,
    createdAt: '2026-03-24T12:00:00.000Z',
    ...overrides,
  };
}

describe('ontology source parsers', () => {
  it('parses extracted YAGO triples into staged concept, relation, and mapping records', async () => {
    const artifactRootDirectory = await mkdtemp(path.join(os.tmpdir(), 'noema-yago-parser-'));
    cleanupPaths.push(artifactRootDirectory);

    const storageKey = 'ontology-imports/yago/run_yago_001/taxonomy.txt';
    const absolutePath = path.join(artifactRootDirectory, storageKey);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(
      absolutePath,
      [
        'https://yago-knowledge.org/resource/Leonhard_Euler\trdf:type\thttps://yago-knowledge.org/resource/Mathematician',
        'https://yago-knowledge.org/resource/Mathematician\trdfs:subClassOf\thttps://yago-knowledge.org/resource/Person',
        'https://yago-knowledge.org/resource/Leonhard_Euler\towl:sameAs\thttps://www.wikidata.org/entity/Q927',
        'https://yago-knowledge.org/resource/Leonhard_Euler\trdfs:label\t"Leonhard Euler"@en',
        'https://yago-knowledge.org/resource/Leonhard_Euler\tschema:birthDate\t"1707-04-15"^^http://www.w3.org/2001/XMLSchema#date',
      ].join('\n'),
      'utf8'
    );

    const parser = new YagoSourceParser(artifactRootDirectory);
    const parsed = await parser.parse(buildRun('yago', '4.5.0.2'), [
      buildArtifact({
        runId: 'run_yago_001',
        sourceId: 'yago',
        storageKey,
      }),
    ]);

    expect(parsed.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordKind: 'concept',
          externalId: 'https://yago-knowledge.org/resource/Leonhard_Euler',
          preferredLabel: 'Leonhard Euler',
          nodeKind: 'entity',
          properties: expect.objectContaining({
            yagoResourceKind: 'instance',
            literalFacts: expect.objectContaining({
              birthDate: [
                expect.objectContaining({
                  value: '1707-04-15',
                  datatype: 'http://www.w3.org/2001/XMLSchema#date',
                }),
              ],
            }),
          }),
        }),
        expect.objectContaining({
          recordKind: 'relation',
          sourcePredicate: 'rdf:type',
        }),
        expect.objectContaining({
          recordKind: 'relation',
          sourcePredicate: 'rdfs:subClassOf',
        }),
        expect.objectContaining({
          recordKind: 'mapping',
          sourceExternalId: 'https://yago-knowledge.org/resource/Leonhard_Euler',
          targetExternalId: 'https://www.wikidata.org/entity/Q927',
          mappingKind: 'exact_match',
        }),
      ])
    );
    expect(
      parsed.records.some(
        (record) =>
          record.recordKind === 'relation' && record.sourcePredicate === 'schema:birthDate'
      )
    ).toBe(false);
  });

  it('parses ESCO payload pages into concept and alias records', async () => {
    const artifactRootDirectory = await mkdtemp(path.join(os.tmpdir(), 'noema-esco-parser-'));
    cleanupPaths.push(artifactRootDirectory);

    const payloadStorageKey = 'ontology-imports/esco/run_esco_001/skills/page-0.json';
    const manifestStorageKey = 'ontology-imports/esco/run_esco_001/manifest.json';
    await writeArtifactJson(artifactRootDirectory, payloadStorageKey, {
      _embedded: {
        'http://data.europa.eu/esco/skill/python': {
          uri: 'http://data.europa.eu/esco/skill/python',
          preferredLabel: { label: 'Python programming', language: 'en' },
          altLabels: ['Python'],
          exactMatch: ['https://www.wikidata.org/entity/Q28865'],
          externalClassifications: ['https://id.loc.gov/authorities/subjects/sh85108448'],
          className: 'skill',
          description: { label: 'Programming with Python.' },
        },
      },
    });
    await writeArtifactJson(artifactRootDirectory, manifestStorageKey, {
      pages: [
        {
          storageKey: payloadStorageKey,
          requestUrl: 'https://ec.europa.eu/esco/api/resource/skill?...',
        },
      ],
    });

    const parser = new EscoSourceParser(artifactRootDirectory);
    const parsed = await parser.parse(buildRun('esco', 'v1.2.0'), [
      buildArtifact({
        id: 'artifact_esco_page',
        runId: 'run_esco_001',
        sourceId: 'esco',
        storageKey: payloadStorageKey,
        contentType: 'application/json',
      }),
      buildArtifact({
        id: 'artifact_esco_manifest',
        runId: 'run_esco_001',
        sourceId: 'esco',
        kind: 'manifest',
        storageKey: manifestStorageKey,
        contentType: 'application/json',
      }),
    ]);

    expect(parsed.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordKind: 'concept',
          externalId: 'http://data.europa.eu/esco/skill/python',
          preferredLabel: 'Python programming',
        }),
        expect.objectContaining({
          recordKind: 'alias',
          alias: 'Python',
        }),
        expect.objectContaining({
          recordKind: 'mapping',
          sourceExternalId: 'http://data.europa.eu/esco/skill/python',
          targetExternalId: 'https://www.wikidata.org/entity/Q28865',
          mappingKind: 'exact_match',
        }),
        expect.objectContaining({
          recordKind: 'mapping',
          sourceExternalId: 'http://data.europa.eu/esco/skill/python',
          targetExternalId: 'https://id.loc.gov/authorities/subjects/sh85108448',
          mappingKind: 'close_match',
        }),
      ])
    );
  });

  it('parses ConceptNet targeted and full payloads into staged records', async () => {
    const artifactRootDirectory = await mkdtemp(path.join(os.tmpdir(), 'noema-conceptnet-parser-'));
    cleanupPaths.push(artifactRootDirectory);

    const targetedStorageKey = 'ontology-imports/conceptnet/run_cn_001/seed/page-0.json';
    const fullStorageKey = 'ontology-imports/conceptnet/run_cn_001/assertions.csv.gz';
    await writeArtifactJson(artifactRootDirectory, targetedStorageKey, {
      edges: [
        {
          '@id': '/a/1',
          rel: { '@id': '/r/UsedFor', label: 'Used For' },
          start: { '@id': '/c/en/python', label: 'Python', language: 'en' },
          end: { '@id': '/c/en/programming', label: 'programming', language: 'en' },
        },
        {
          '@id': '/a/1-external',
          rel: { '@id': '/r/ExternalURL', label: 'External URL' },
          start: { '@id': '/c/en/python', label: 'Python', language: 'en' },
          end: { '@id': 'https://www.wikidata.org/entity/Q28865', label: 'Wikidata' },
        },
      ],
    });
    await writeArtifactGzip(
      artifactRootDirectory,
      fullStorageKey,
      [
        '/a/2\t/r/IsA\t/c/en/python\t/c/en/language',
        '/a/3\t/r/ExternalURL\t/c/en/python\thttps://dbpedia.org/resource/Python_(programming_language)',
      ].join('\n')
    );

    const parser = new ConceptNetSourceParser(artifactRootDirectory);
    const parsed = await parser.parse(buildRun('conceptnet', '5.7.0'), [
      buildArtifact({
        id: 'artifact_cn_json',
        runId: 'run_cn_001',
        sourceId: 'conceptnet',
        storageKey: targetedStorageKey,
        contentType: 'application/json',
      }),
      buildArtifact({
        id: 'artifact_cn_gz',
        runId: 'run_cn_001',
        sourceId: 'conceptnet',
        storageKey: fullStorageKey,
        contentType: 'application/gzip',
      }),
    ]);

    expect(parsed.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordKind: 'relation',
          externalId: '/a/1',
        }),
        expect.objectContaining({
          recordKind: 'relation',
          externalId: '/a/2',
        }),
        expect.objectContaining({
          recordKind: 'concept',
          externalId: '/c/en/python',
        }),
        expect.objectContaining({
          recordKind: 'mapping',
          sourceExternalId: '/c/en/python',
          targetExternalId: 'https://www.wikidata.org/entity/Q28865',
          mappingKind: 'close_match',
        }),
        expect.objectContaining({
          recordKind: 'mapping',
          sourceExternalId: '/c/en/python',
          targetExternalId: 'https://dbpedia.org/resource/Python_(programming_language)',
          mappingKind: 'close_match',
        }),
      ])
    );
  });

  it('routes parsing through the shared parsing service by source id', async () => {
    const artifactRootDirectory = await mkdtemp(path.join(os.tmpdir(), 'noema-parsing-service-'));
    cleanupPaths.push(artifactRootDirectory);

    const storageKey = 'ontology-imports/esco/run_esco_002/skills/page-0.json';
    await writeArtifactJson(artifactRootDirectory, storageKey, {
      _embedded: {
        'http://data.europa.eu/esco/skill/research': {
          uri: 'http://data.europa.eu/esco/skill/research',
          preferredLabel: { label: 'Research', language: 'en' },
        },
      },
    });

    const parsingService = new OntologyImportParsingService([
      new EscoSourceParser(artifactRootDirectory),
    ]);

    const parsed = await parsingService.parseRun(buildRun('esco', 'v1.2.0'), [
      buildArtifact({
        id: 'artifact_esco_service',
        runId: 'run_esco_002',
        sourceId: 'esco',
        storageKey,
        contentType: 'application/json',
      }),
    ]);

    expect(parsed.sourceId).toBe('esco');
    expect(parsed.records[0]).toEqual(
      expect.objectContaining({
        recordKind: 'concept',
        preferredLabel: 'Research',
      })
    );
  });

  it('extracts future-ready OpenAlex mappings from source-native ids payloads', () => {
    const mappings = extractOpenAlexMappings({
      ids: {
        openalex: 'https://openalex.org/C41008148',
        wikidata: 'https://www.wikidata.org/entity/Q21198',
        wikipedia: 'https://en.wikipedia.org/wiki/Graph_theory',
      },
    });

    expect(mappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetExternalId: 'https://www.wikidata.org/entity/Q21198',
          mappingKind: 'exact_match',
        }),
        expect.objectContaining({
          targetExternalId: 'https://en.wikipedia.org/wiki/Graph_theory',
          mappingKind: 'close_match',
        }),
      ])
    );
  });

  it('extracts future-ready GeoNames mappings from wikipedia and linked alternate names', () => {
    const mappings = extractGeoNamesMappings({
      wikipediaURL: 'https://en.wikipedia.org/wiki/Bucharest',
      alternateNames: [
        { lang: 'wkdt', name: 'https://www.wikidata.org/entity/Q19660' },
        { lang: 'link', name: 'https://dbpedia.org/resource/Bucharest' },
      ],
    });

    expect(mappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetExternalId: 'https://www.wikidata.org/entity/Q19660',
          mappingKind: 'exact_match',
        }),
        expect.objectContaining({
          targetExternalId: 'https://dbpedia.org/resource/Bucharest',
          mappingKind: 'close_match',
        }),
      ])
    );
  });
});

async function writeArtifactJson(
  artifactRootDirectory: string,
  storageKey: string,
  value: unknown
): Promise<void> {
  const absolutePath = path.join(artifactRootDirectory, storageKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(value, null, 2), 'utf8');
}

async function writeArtifactGzip(
  artifactRootDirectory: string,
  storageKey: string,
  value: string
): Promise<void> {
  const absolutePath = path.join(artifactRootDirectory, storageKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, gzipSync(Buffer.from(value, 'utf8')));
}
