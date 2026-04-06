import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  extractRelativeImportSpecifiers,
  findLayerDependencyViolations,
  findUnresolvedTrackedFiles,
  normalizeRelativePath,
  resolveRelativeImportPath,
} from './stratified-graph-dependency-checker.js';

const DOMAIN_ROOT = path.resolve(process.cwd(), 'src', 'domain', 'knowledge-graph-service');
const EXTRA_ROOTS = [
  path.resolve(process.cwd(), 'src', 'application', 'knowledge-graph', 'aggregation'),
  path.resolve(process.cwd(), 'src', 'infrastructure', 'proof'),
  path.resolve(process.cwd(), 'src', 'infrastructure', 'ontology'),
] as const;

async function listTypeScriptFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTypeScriptFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith('.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

async function buildImportsByFile(): Promise<Map<string, readonly string[]>> {
  const files = [
    ...(await listTypeScriptFiles(DOMAIN_ROOT)),
    ...(await Promise.all(EXTRA_ROOTS.map((root) => listTypeScriptFiles(root)))).flat(),
  ];
  const importsByFile = new Map<string, readonly string[]>();

  for (const fullPath of files) {
    const relativePath = normalizeRelativePath(
      path.relative(path.resolve(process.cwd(), 'src'), fullPath)
    );
    const sourceText = await fs.readFile(fullPath, 'utf8');
    const resolvedImports = extractRelativeImportSpecifiers(sourceText).map((specifier) =>
      resolveRelativeImportPath(relativePath, specifier)
    );
    importsByFile.set(relativePath, resolvedImports);
  }

  return importsByFile;
}

async function main(): Promise<void> {
  const importsByFile = await buildImportsByFile();
  const violations = findLayerDependencyViolations(importsByFile);
  const unresolvedTrackedFiles = findUnresolvedTrackedFiles([...importsByFile.keys()]);

  if (violations.length === 0 && unresolvedTrackedFiles.length === 0) {
    process.stdout.write(
      'Stratified graph dependency check passed: no reverse imports detected.\n'
    );
    return;
  }

  const lines = violations.map(
    (violation) =>
      `${violation.importer} (${violation.importerLayer.name}) -> ${violation.imported} (${violation.importedLayer.name})`
  );

  const unresolvedLines = unresolvedTrackedFiles.map(
    (file) => `${file.relativePath} (tracked graph file has no assigned stratified layer)`
  );

  process.stderr.write(
    `Stratified graph dependency check failed with ${String(violations.length + unresolvedTrackedFiles.length)} issue(s):\n${[...lines, ...unresolvedLines].join('\n')}\n`
  );
  process.exitCode = 1;
}

void main().catch((error: unknown) => {
  process.stderr.write(`Failed to run stratified graph dependency check: ${String(error)}\n`);
  process.exitCode = 1;
});
