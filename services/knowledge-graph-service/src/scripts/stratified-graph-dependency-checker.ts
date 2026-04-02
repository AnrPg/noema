import path from 'node:path';

export interface IStratifiedLayerDefinition {
  readonly id: number;
  readonly name: string;
  readonly patterns: readonly string[];
}

export interface IResolvedLayer {
  readonly id: number;
  readonly name: string;
}

export interface ILayerDependencyViolation {
  readonly importer: string;
  readonly imported: string;
  readonly importerLayer: IResolvedLayer;
  readonly importedLayer: IResolvedLayer;
}

export const STRATIFIED_GRAPH_LAYER_IGNORED_PATHS: readonly string[] = ['metrics/index.ts'];

export const STRATIFIED_GRAPH_LAYER_DEFINITIONS: readonly IStratifiedLayerDefinition[] = [
  {
    id: 0,
    name: 'Layer 0 - Structural Base Facts',
    patterns: [
      'graph.repository.ts',
      'graph-restoration.repository.ts',
      'graph-snapshot.repository.ts',
      'pkg-operation-log.repository.ts',
      'ckg-mutation-dsl.ts',
      'ckg-typestate.ts',
      'mutation.repository.ts',
      'proof-stage.ts',
    ],
  },
  {
    id: 1,
    name: 'Layer 1 - Deterministic Graph Derivations',
    patterns: ['graph-analysis.ts'],
  },
  {
    id: 2,
    name: 'Layer 2 - Ontology Reasoning',
    patterns: ['ontology-reasoning.ts', 'unity-invariants.ts'],
  },
  {
    id: 3,
    name: 'Layer 3 - Aggregated and Statistical Signals',
    patterns: ['aggregation-evidence.repository.ts', 'metrics.repository.ts', 'metrics/**'],
  },
  {
    id: 4,
    name: 'Layer 4 - Pedagogical and Diagnostic Logic',
    patterns: [
      'misconception.repository.ts',
      'misconception/**',
      'metrics/health/**',
      'metrics-orchestrator.service.ts',
      'pkg-advisories.ts',
    ],
  },
] as const;

function matchesPattern(relativePath: string, pattern: string): boolean {
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return relativePath === prefix || relativePath.startsWith(`${prefix}/`);
  }

  return relativePath === pattern;
}

export function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/');
}

export function resolveLayerForRelativePath(relativePath: string): IResolvedLayer | null {
  const normalized = normalizeRelativePath(relativePath);
  if (STRATIFIED_GRAPH_LAYER_IGNORED_PATHS.includes(normalized)) {
    return null;
  }
  const matchingDefinitions = STRATIFIED_GRAPH_LAYER_DEFINITIONS.filter((definition) =>
    definition.patterns.some((pattern) => matchesPattern(normalized, pattern))
  );

  if (matchingDefinitions.length === 0) {
    return null;
  }

  const bestMatch = matchingDefinitions
    .map((definition) => ({
      definition,
      specificity: Math.max(
        ...definition.patterns
          .filter((pattern) => matchesPattern(normalized, pattern))
          .map((pattern) => pattern.length)
      ),
    }))
    .sort((left, right) => right.specificity - left.specificity)[0];

  return bestMatch === undefined
    ? null
    : {
        id: bestMatch.definition.id,
        name: bestMatch.definition.name,
      };
}

export function extractRelativeImportSpecifiers(sourceText: string): string[] {
  const matches = sourceText.matchAll(/from\s+['"](\.[^'"]+)['"]/g);
  return [...matches].map((match) => match[1] ?? '').filter((specifier) => specifier !== '');
}

export function resolveRelativeImportPath(
  importerRelativePath: string,
  importSpecifier: string
): string {
  const importerDir = path.posix.dirname(normalizeRelativePath(importerRelativePath));
  const resolvedBase = normalizeRelativePath(
    path.posix.normalize(path.posix.join(importerDir, importSpecifier))
  );

  const candidates = [
    resolvedBase.replace(/\.js$/u, '.ts'),
    resolvedBase.replace(/\/index\.js$/u, '/index.ts'),
    `${resolvedBase}.ts`,
    `${resolvedBase}/index.ts`,
    resolvedBase,
  ];

  return candidates[0] ?? resolvedBase;
}

export function findLayerDependencyViolations(
  importsByFile: ReadonlyMap<string, readonly string[]>
): ILayerDependencyViolation[] {
  const violations: ILayerDependencyViolation[] = [];

  for (const [importer, imports] of importsByFile.entries()) {
    const importerLayer = resolveLayerForRelativePath(importer);
    if (importerLayer === null) {
      continue;
    }

    for (const imported of imports) {
      const importedLayer = resolveLayerForRelativePath(imported);
      if (importedLayer === null) {
        continue;
      }

      if (importerLayer.id < importedLayer.id) {
        violations.push({
          importer,
          imported,
          importerLayer,
          importedLayer,
        });
      }
    }
  }

  return violations;
}
