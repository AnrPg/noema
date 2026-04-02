import { describe, expect, it } from 'vitest';
import {
  buildNodeProperties,
  buildNodeUpdateProperties,
  mapNodeToGraphNode,
} from '../../../src/infrastructure/database/neo4j-mapper.js';

describe('buildNodeProperties', () => {
  it('serializes arrays of objects so ontology-import payloads remain Neo4j-safe', () => {
    const properties = buildNodeProperties(
      {
        label: 'ESCO concept',
        nodeType: 'concept',
        domain: 'skills-and-occupations',
        properties: {
          codes: [
            { value: '0', datatype: '' },
            { value: '0', datatype: 'http://data.europa.eu/esco/Notation/ISCO08' },
          ],
          preferredLabel: {
            en: 'Armed forces occupations',
          },
          languages: ['en', 'ro'],
        },
      },
      'node_test_mapper_0001' as never,
      'ckg'
    );

    expect(properties['codes']).toBe(
      JSON.stringify([
        { value: '0', datatype: '' },
        { value: '0', datatype: 'http://data.europa.eu/esco/Notation/ISCO08' },
      ])
    );
    expect(properties['preferredLabel']).toBe(
      JSON.stringify({
        en: 'Armed forces occupations',
      })
    );
    expect(properties['languages']).toEqual(['en', 'ro']);
  });

  it('serializes canonical refs and ontology mappings into Neo4j-safe JSON strings', () => {
    const properties = buildNodeProperties(
      {
        label: 'Leonhard Euler',
        nodeType: 'concept',
        domain: 'world-knowledge',
        canonicalExternalRefs: [
          {
            sourceId: 'yago',
            externalId: 'https://yago-knowledge.org/resource/Leonhard_Euler',
            iri: 'https://yago-knowledge.org/resource/Leonhard_Euler',
          },
        ],
        ontologyMappings: [
          {
            sourceId: 'yago',
            externalId: 'https://yago-knowledge.org/resource/Leonhard_Euler',
            mappingKind: 'same_as',
            targetExternalId: 'Q123',
          },
        ],
        provenance: [
          {
            sourceId: 'yago',
            sourceVersion: '4.5',
            recordKind: 'concept',
          },
        ],
        reviewMetadata: {
          confidenceScore: 0.93,
          confidenceBand: 'high',
          notes: ['Imported from YAGO'],
        },
        sourceCoverage: {
          contributingSourceIds: ['yago'],
          sourceCount: 1,
          hasBackboneSource: true,
        },
      },
      'node_test_mapper_0002' as never,
      'ckg'
    );

    expect(properties['canonicalExternalRefs']).toBe(
      JSON.stringify([
        {
          sourceId: 'yago',
          externalId: 'https://yago-knowledge.org/resource/Leonhard_Euler',
          iri: 'https://yago-knowledge.org/resource/Leonhard_Euler',
        },
      ])
    );
    expect(properties['ontologyMappings']).toBe(
      JSON.stringify([
        {
          sourceId: 'yago',
          externalId: 'https://yago-knowledge.org/resource/Leonhard_Euler',
          mappingKind: 'same_as',
          targetExternalId: 'Q123',
        },
      ])
    );
    expect(properties['provenance']).toBe(
      JSON.stringify([
        {
          sourceId: 'yago',
          sourceVersion: '4.5',
          recordKind: 'concept',
        },
      ])
    );
    expect(properties['reviewMetadata']).toBe(
      JSON.stringify({
        confidenceScore: 0.93,
        confidenceBand: 'high',
        notes: ['Imported from YAGO'],
      })
    );
    expect(properties['sourceCoverage']).toBe(
      JSON.stringify({
        contributingSourceIds: ['yago'],
        sourceCount: 1,
        hasBackboneSource: true,
      })
    );
  });
});

describe('buildNodeUpdateProperties', () => {
  it('serializes structured ontology metadata on updates too', () => {
    const properties = buildNodeUpdateProperties({
      canonicalExternalRefs: [
        {
          sourceId: 'yago',
          externalId: 'Q1',
        },
      ],
      ontologyMappings: [
        {
          sourceId: 'yago',
          externalId: 'Q1',
          mappingKind: 'same_as',
          targetExternalId: 'Q2',
        },
      ],
    });

    expect(properties['canonicalExternalRefs']).toBe(
      JSON.stringify([
        {
          sourceId: 'yago',
          externalId: 'Q1',
        },
      ])
    );
    expect(properties['ontologyMappings']).toBe(
      JSON.stringify([
        {
          sourceId: 'yago',
          externalId: 'Q1',
          mappingKind: 'same_as',
          targetExternalId: 'Q2',
        },
      ])
    );
  });
});

describe('mapNodeToGraphNode', () => {
  it('prefers the stored nodeType property when labels are stale', () => {
    const node = {
      labels: ['CkgNode', 'Concept'],
      properties: {
        nodeId: 'node_mapper_type_fix_0001',
        graphType: 'ckg',
        nodeType: 'skill',
        label: 'Hand gestures',
        domain: 'skills-and-occupations',
        createdAt: '2026-03-28T10:00:00.000Z',
        updatedAt: '2026-03-28T10:05:00.000Z',
        isDeleted: false,
      },
    } as never;

    const mappedNode = mapNodeToGraphNode(node);

    expect(mappedNode.nodeType).toBe('skill');
  });
});
