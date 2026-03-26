import { describe, expect, it } from 'vitest';
import { buildNodeProperties } from '../../../src/infrastructure/database/neo4j-mapper.js';

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
});
