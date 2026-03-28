import { describe, expect, it } from 'vitest';
import { OntologyImportNormalizationService } from '../../../src/application/knowledge-graph/ontology-imports/normalization/index.js';
import {
  ConceptNetSourceNormalizer,
  EscoSourceNormalizer,
  YagoSourceNormalizer,
} from '../../../src/infrastructure/ontology-imports/index.js';
import type { IParsedOntologyGraphBatch } from '../../../src/domain/knowledge-graph-service/ontology-imports.contracts.js';

describe('OntologyImportNormalizationService', () => {
  it('normalizes aliases into concept candidates and source predicates into normalized relations', async () => {
    const service = new OntologyImportNormalizationService([new ConceptNetSourceNormalizer()]);
    const batch: IParsedOntologyGraphBatch = {
      runId: 'run_cn_001',
      sourceId: 'conceptnet',
      sourceVersion: '5.7.0',
      generatedAt: '2026-03-24T12:00:00.000Z',
      records: [
        {
          recordKind: 'concept',
          externalId: '/c/en/python',
          iri: null,
          nodeKind: 'concept',
          preferredLabel: 'Python',
          altLabels: [],
          description: null,
          languages: ['en'],
          sourceTypes: ['conceptnet_term'],
          properties: {},
          provenance: {
            sourceId: 'conceptnet',
            sourceVersion: '5.7.0',
            runId: 'run_cn_001',
            artifactId: 'artifact_001',
            harvestedAt: '2026-03-24T12:00:00.000Z',
            license: null,
            requestUrl: null,
          },
        },
        {
          recordKind: 'alias',
          externalId: '/c/en/python#alias-0',
          conceptExternalId: '/c/en/python',
          alias: 'Python programming',
          language: 'en',
          aliasType: 'synonym',
          provenance: {
            sourceId: 'conceptnet',
            sourceVersion: '5.7.0',
            runId: 'run_cn_001',
            artifactId: 'artifact_001',
            harvestedAt: '2026-03-24T12:00:00.000Z',
            license: null,
            requestUrl: null,
          },
        },
        {
          recordKind: 'relation',
          externalId: '/a/1',
          iri: null,
          sourcePredicate: '/r/UsedFor',
          predicateLabel: 'Used For',
          subjectExternalId: '/c/en/python',
          objectExternalId: '/c/en/programming',
          direction: 'directed',
          languages: ['en'],
          properties: {},
          provenance: {
            sourceId: 'conceptnet',
            sourceVersion: '5.7.0',
            runId: 'run_cn_001',
            artifactId: 'artifact_001',
            harvestedAt: '2026-03-24T12:00:00.000Z',
            license: null,
            requestUrl: null,
          },
        },
      ],
    };

    const normalized = await service.normalizeBatch(batch);

    expect(normalized.concepts[0]?.aliases).toEqual(['Python programming']);
    expect(normalized.relations[0]?.normalizedPredicate).toBe('used_for');
  });

  it('dispatches YAGO and ESCO batches through their registered source normalizers', async () => {
    const service = new OntologyImportNormalizationService([
      new YagoSourceNormalizer(),
      new EscoSourceNormalizer(),
    ]);

    const yagoBatch: IParsedOntologyGraphBatch = {
      runId: 'run_yago_001',
      sourceId: 'yago',
      sourceVersion: '4.5.0.2',
      generatedAt: '2026-03-24T12:00:00.000Z',
      records: [
        {
          recordKind: 'relation',
          externalId: 'rel_1',
          iri: null,
          sourcePredicate: 'rdf:type',
          predicateLabel: 'type',
          subjectExternalId: 'yago:Euler',
          objectExternalId: 'yago:Mathematician',
          direction: 'directed',
          languages: ['en'],
          properties: {},
          provenance: {
            sourceId: 'yago',
            sourceVersion: '4.5.0.2',
            runId: 'run_yago_001',
            artifactId: 'artifact_001',
            harvestedAt: '2026-03-24T12:00:00.000Z',
            license: null,
            requestUrl: null,
          },
        },
        {
          recordKind: 'relation',
          externalId: 'rel_2',
          iri: null,
          sourcePredicate: 'rdfs:subClassOf',
          predicateLabel: 'subClassOf',
          subjectExternalId: 'yago:Mathematician',
          objectExternalId: 'yago:Person',
          direction: 'directed',
          languages: ['en'],
          properties: { relationFamily: 'taxonomy' },
          provenance: {
            sourceId: 'yago',
            sourceVersion: '4.5.0.2',
            runId: 'run_yago_001',
            artifactId: 'artifact_001',
            harvestedAt: '2026-03-24T12:00:00.000Z',
            license: null,
            requestUrl: null,
          },
        },
        {
          recordKind: 'concept',
          externalId: 'yago:Euler',
          iri: null,
          nodeKind: 'entity',
          preferredLabel: 'Leonhard Euler',
          altLabels: ['Euler'],
          description: null,
          languages: ['en'],
          sourceTypes: ['yago_instance'],
          properties: {
            yagoResourceKind: 'instance',
            literalFacts: {
              birthDate: [
                {
                  value: '1707-04-15',
                  datatype: 'http://www.w3.org/2001/XMLSchema#date',
                  language: null,
                  sourcePredicate: 'schema:birthDate',
                },
              ],
            },
          },
          provenance: {
            sourceId: 'yago',
            sourceVersion: '4.5.0.2',
            runId: 'run_yago_001',
            artifactId: 'artifact_001',
            harvestedAt: '2026-03-24T12:00:00.000Z',
            license: null,
            requestUrl: null,
          },
        },
      ],
    };

    const escoBatch: IParsedOntologyGraphBatch = {
      runId: 'run_esco_001',
      sourceId: 'esco',
      sourceVersion: 'v1.2.0',
      generatedAt: '2026-03-24T12:00:00.000Z',
      records: [],
    };

    const [normalizedYago, normalizedEsco] = await Promise.all([
      service.normalizeBatch(yagoBatch),
      service.normalizeBatch(escoBatch),
    ]);

    expect(normalizedYago.relations[0]?.normalizedPredicate).toBe('instance_of');
    expect(normalizedYago.relations[1]?.normalizedPredicate).toBe('subclass_of');
    expect(normalizedYago.concepts[0]?.properties).toEqual(
      expect.objectContaining({
        literalFacts: expect.objectContaining({
          birthDate: [
            expect.objectContaining({
              value: '1707-04-15',
            }),
          ],
        }),
      })
    );
    expect(normalizedEsco.sourceId).toBe('esco');
  });

  it('propagates exact and close mappings across connected mapping components', async () => {
    const service = new OntologyImportNormalizationService([new ConceptNetSourceNormalizer()]);
    const batch: IParsedOntologyGraphBatch = {
      runId: 'run_cn_002',
      sourceId: 'conceptnet',
      sourceVersion: '5.7.0',
      generatedAt: '2026-03-24T12:00:00.000Z',
      records: [
        {
          recordKind: 'mapping',
          externalId: 'map_exact_1',
          sourceExternalId: '/c/en/python',
          targetExternalId: 'https://www.wikidata.org/entity/Q28865',
          mappingKind: 'exact_match',
          provenance: {
            sourceId: 'conceptnet',
            sourceVersion: '5.7.0',
            runId: 'run_cn_002',
            artifactId: 'artifact_001',
            harvestedAt: '2026-03-24T12:00:00.000Z',
            license: null,
            requestUrl: null,
          },
        },
        {
          recordKind: 'mapping',
          externalId: 'map_close_1',
          sourceExternalId: 'https://www.wikidata.org/entity/Q28865',
          targetExternalId: 'https://dbpedia.org/resource/Python_(programming_language)',
          mappingKind: 'close_match',
          provenance: {
            sourceId: 'conceptnet',
            sourceVersion: '5.7.0',
            runId: 'run_cn_002',
            artifactId: 'artifact_001',
            harvestedAt: '2026-03-24T12:00:00.000Z',
            license: null,
            requestUrl: null,
          },
        },
      ],
    };

    const normalized = await service.normalizeBatch(batch);

    expect(normalized.mappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceExternalId: 'https://www.wikidata.org/entity/Q28865',
          targetExternalId: '/c/en/python',
          mappingKind: 'exact_match',
          confidenceBand: 'high',
        }),
        expect.objectContaining({
          sourceExternalId: '/c/en/python',
          targetExternalId: 'https://dbpedia.org/resource/Python_(programming_language)',
          mappingKind: 'close_match',
          confidenceBand: 'medium',
        }),
      ])
    );
  });

  it('flags conflicting exact matches with lower confidence so downstream resolution can stay cautious', async () => {
    const service = new OntologyImportNormalizationService([new ConceptNetSourceNormalizer()]);
    const batch: IParsedOntologyGraphBatch = {
      runId: 'run_cn_003',
      sourceId: 'conceptnet',
      sourceVersion: '5.7.0',
      generatedAt: '2026-03-24T12:00:00.000Z',
      records: [
        {
          recordKind: 'mapping',
          externalId: 'map_conflict_1',
          sourceExternalId: '/c/en/python',
          targetExternalId: 'https://www.wikidata.org/entity/Q28865',
          mappingKind: 'exact_match',
          provenance: {
            sourceId: 'conceptnet',
            sourceVersion: '5.7.0',
            runId: 'run_cn_003',
            artifactId: 'artifact_001',
            harvestedAt: '2026-03-24T12:00:00.000Z',
            license: null,
            requestUrl: null,
          },
        },
        {
          recordKind: 'mapping',
          externalId: 'map_conflict_2',
          sourceExternalId: '/c/en/python',
          targetExternalId: 'https://www.wikidata.org/entity/Q99999',
          mappingKind: 'exact_match',
          provenance: {
            sourceId: 'conceptnet',
            sourceVersion: '5.7.0',
            runId: 'run_cn_003',
            artifactId: 'artifact_001',
            harvestedAt: '2026-03-24T12:00:00.000Z',
            license: null,
            requestUrl: null,
          },
        },
      ],
    };

    const normalized = await service.normalizeBatch(batch);

    expect(normalized.mappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceExternalId: '/c/en/python',
          targetExternalId: 'https://www.wikidata.org/entity/Q28865',
          confidenceBand: 'medium',
          conflictFlags: expect.arrayContaining(['mapping_conflict']),
        }),
      ])
    );
  });
});
