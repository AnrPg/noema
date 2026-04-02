import { describe, expect, it } from 'vitest';

import {
  findLayerDependencyViolations,
  resolveLayerForRelativePath,
  STRATIFIED_GRAPH_LAYER_DEFINITIONS,
  STRATIFIED_GRAPH_LAYER_IGNORED_PATHS,
} from '../../../src/scripts/stratified-graph-dependency-checker.js';

describe('stratified graph dependency checker', () => {
  it('resolves known graph modules into the expected layers', () => {
    expect(resolveLayerForRelativePath('graph-analysis.ts')?.id).toBe(1);
    expect(resolveLayerForRelativePath('proof-stage.ts')?.id).toBe(0);
    expect(resolveLayerForRelativePath('ontology-reasoning.ts')?.id).toBe(2);
    expect(resolveLayerForRelativePath('metrics/structural-metrics-engine.ts')?.id).toBe(3);
    expect(resolveLayerForRelativePath('metrics/health/structural-health.ts')?.id).toBe(4);
    expect(resolveLayerForRelativePath('misconception/misconception-detection-engine.ts')?.id).toBe(
      4
    );
    expect(resolveLayerForRelativePath('metrics/index.ts')).toBeNull();
  });

  it('flags reverse imports from lower layers into higher layers', () => {
    const violations = findLayerDependencyViolations(
      new Map<string, readonly string[]>([
        ['pkg-write.service.ts', ['misconception/misconception-detection-engine.ts']],
        ['graph-analysis.ts', ['ontology-reasoning.ts']],
        [
          'metrics/structural-metrics-engine.ts',
          ['misconception/misconception-detection-engine.ts'],
        ],
      ])
    );

    expect(violations).toHaveLength(2);
    expect(violations.map((violation) => violation.importerLayer.id)).toEqual([1, 3]);
    expect(violations.map((violation) => violation.importedLayer.id)).toEqual([2, 4]);
  });

  it('allows same-layer and downward imports', () => {
    const violations = findLayerDependencyViolations(
      new Map<string, readonly string[]>([
        [
          'misconception/misconception-detection-engine.ts',
          ['metrics/structural-metrics-engine.ts'],
        ],
        ['ontology-reasoning.ts', ['graph-analysis.ts']],
        ['metrics/structural-metrics-engine.ts', ['metrics/types.ts']],
      ])
    );

    expect(violations).toEqual([]);
    expect(STRATIFIED_GRAPH_LAYER_DEFINITIONS).toHaveLength(5);
    expect(STRATIFIED_GRAPH_LAYER_IGNORED_PATHS).toContain('metrics/index.ts');
  });
});
