import { describe, expect, it } from 'vitest';
import {
  NormalizedOntologyGraphBatchSchema,
  OntologyMutationPreviewBatchSchema,
  OntologyGraphConceptRecordSchema,
  OntologyGraphRecordSchema,
  OntologyGraphRelationRecordSchema,
  ParsedOntologyGraphBatchSchema,
} from '../../../src/domain/knowledge-graph-service/ontology-imports.contracts.js';

const provenance = {
  sourceId: 'yago',
  sourceVersion: '4.5.0.2',
  runId: 'run_ontology_001',
  artifactId: 'artifact_001',
  harvestedAt: '2026-03-24T12:00:00.000Z',
  license: 'CC BY 4.0',
  requestUrl: 'https://yago-knowledge.org/data/yago4.5/yago-4.5.0.2-tiny.zip',
};

describe('ontology import graph contracts', () => {
  it('accepts concept records that preserve source-native labels and provenance', () => {
    const parsed = OntologyGraphConceptRecordSchema.parse({
      recordKind: 'concept',
      externalId: 'yago:Euler',
      iri: 'https://yago-knowledge.org/resource/Leonhard_Euler',
      nodeKind: 'entity',
      preferredLabel: 'Leonhard Euler',
      altLabels: ['Euler'],
      description: 'Swiss mathematician.',
      languages: ['en'],
      sourceTypes: ['Person'],
      properties: {
        sourceRank: 1,
      },
      provenance,
    });

    expect(parsed.recordKind).toBe('concept');
    expect(parsed.preferredLabel).toBe('Leonhard Euler');
    expect(parsed.provenance.sourceId).toBe('yago');
  });

  it('accepts relation records that preserve source-native predicates', () => {
    const parsed = OntologyGraphRelationRecordSchema.parse({
      recordKind: 'relation',
      externalId: 'yago-edge:1',
      iri: null,
      sourcePredicate: 'rdf:type',
      predicateLabel: 'type',
      subjectExternalId: 'yago:Euler',
      objectExternalId: 'yago:Mathematician',
      direction: 'directed',
      languages: ['en'],
      properties: {
        confidence: 0.98,
      },
      provenance,
    });

    expect(parsed.sourcePredicate).toBe('rdf:type');
    expect(parsed.subjectExternalId).toBe('yago:Euler');
  });

  it('rejects records without the required provenance pointer', () => {
    expect(() =>
      OntologyGraphRecordSchema.parse({
        recordKind: 'alias',
        externalId: 'alias:1',
        conceptExternalId: 'yago:Euler',
        alias: 'Euler',
        language: 'en',
        aliasType: 'short_label',
      })
    ).toThrow();
  });

  it('accepts parsed batches that combine ontology concepts and relations', () => {
    const parsed = ParsedOntologyGraphBatchSchema.parse({
      runId: 'run_ontology_001',
      sourceId: 'esco',
      sourceVersion: 'v1.2.0',
      generatedAt: '2026-03-24T12:00:00.000Z',
      records: [
        {
          recordKind: 'concept',
          externalId: 'esco:skill:python',
          iri: 'http://data.europa.eu/esco/skill/python',
          nodeKind: 'concept',
          preferredLabel: 'Python programming',
          altLabels: ['Python'],
          description: 'Programming with Python.',
          languages: ['en'],
          sourceTypes: ['skill'],
          properties: {},
          provenance: {
            ...provenance,
            sourceId: 'esco',
            sourceVersion: 'v1.2.0',
            requestUrl: 'https://ec.europa.eu/esco/api/resource/skill?selectedVersion=v1.2.0',
          },
        },
        {
          recordKind: 'relation',
          externalId: 'esco-edge:1',
          iri: null,
          sourcePredicate: 'broader',
          predicateLabel: 'broader',
          subjectExternalId: 'esco:skill:python',
          objectExternalId: 'esco:skill:programming',
          direction: 'directed',
          languages: ['en'],
          properties: {},
          provenance: {
            ...provenance,
            sourceId: 'esco',
            sourceVersion: 'v1.2.0',
            requestUrl: 'https://ec.europa.eu/esco/api/resource/skill?selectedVersion=v1.2.0',
          },
        },
      ],
    });

    expect(parsed.records).toHaveLength(2);
    expect(parsed.records[0]?.recordKind).toBe('concept');
    expect(parsed.records[1]?.recordKind).toBe('relation');
  });

  it('accepts normalized batches that aggregate aliases and normalized predicates', () => {
    const normalized = NormalizedOntologyGraphBatchSchema.parse({
      runId: 'run_ontology_001',
      sourceId: 'conceptnet',
      sourceVersion: '5.7.0',
      generatedAt: '2026-03-24T12:05:00.000Z',
      rawRecordCount: 3,
      conceptCount: 1,
      relationCount: 1,
      mappingCount: 0,
      concepts: [
        {
          externalId: '/c/en/python',
          iri: null,
          nodeKind: 'concept',
          preferredLabel: 'Python',
          aliases: ['Python programming'],
          description: null,
          languages: ['en'],
          sourceTypes: ['conceptnet_term'],
          properties: {},
          provenance: [provenance],
        },
      ],
      relations: [
        {
          externalId: '/a/1',
          iri: null,
          normalizedPredicate: 'used_for',
          predicateLabel: 'Used For',
          subjectExternalId: '/c/en/python',
          objectExternalId: '/c/en/programming',
          direction: 'directed',
          sourcePredicates: ['/r/UsedFor'],
          properties: {},
          provenance: [provenance],
        },
      ],
      mappings: [],
    });

    expect(normalized.concepts[0]?.aliases).toEqual(['Python programming']);
    expect(normalized.relations[0]?.normalizedPredicate).toBe('used_for');
  });

  it('accepts mutation preview batches that contain ready proposals and blocked candidates', () => {
    const preview = OntologyMutationPreviewBatchSchema.parse({
      runId: 'run_ontology_001',
      sourceId: 'conceptnet',
      sourceVersion: '5.7.0',
      generatedAt: '2026-03-24T12:10:00.000Z',
      artifactId: null,
      proposalCount: 1,
      readyProposalCount: 1,
      blockedCandidateCount: 1,
      candidates: [
        {
          candidateId: 'concept:/c/en/python',
          entityKind: 'concept',
          status: 'ready',
          title: 'Add concept: Python',
          summary: 'Create a canonical concept node from ConceptNet.',
          rationale: 'Import Python with source provenance.',
          blockedReason: null,
          dependencyExternalIds: [],
          proposal: {
            operations: [
              {
                type: 'add_node',
                nodeType: 'concept',
                label: 'Python',
                description: '',
                domain: 'commonsense',
                properties: {},
              },
            ],
            rationale: 'Import Python with source provenance.',
            evidenceCount: 1,
            priority: 10,
          },
        },
        {
          candidateId: 'relation:/a/1',
          entityKind: 'relation',
          status: 'blocked',
          title: 'Defer relation: used_for',
          summary: '/c/en/python used_for /c/en/programming',
          rationale: 'Wait for canonical node resolution.',
          blockedReason: 'Needs canonical node ids.',
          dependencyExternalIds: ['/c/en/python', '/c/en/programming'],
          proposal: null,
        },
      ],
    });

    expect(preview.readyProposalCount).toBe(1);
    expect(preview.blockedCandidateCount).toBe(1);
  });
});
