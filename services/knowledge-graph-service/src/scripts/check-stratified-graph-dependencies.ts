import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  extractRelativeImportSpecifiers,
  findLayerDependencyViolations,
  normalizeRelativePath,
  resolveRelativeImportPath,
} from './stratified-graph-dependency-checker.js';

const DOMAIN_ROOT = path.resolve(process.cwd(), 'src', 'domain', 'knowledge-graph-service');

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
  const files = await listTypeScriptFiles(DOMAIN_ROOT);
  const importsByFile = new Map<string, readonly string[]>();

  for (const fullPath of files) {
    const relativePath = normalizeRelativePath(path.relative(DOMAIN_ROOT, fullPath));
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

  if (violations.length === 0) {
    process.stdout.write(
      'Stratified graph dependency check passed: no reverse imports detected.\n'
    );
    return;
  }

  const lines = violations.map(
    (violation) =>
      `${violation.importer} (${violation.importerLayer.name}) -> ${violation.imported} (${violation.importedLayer.name})`
  );

  process.stderr.write(
    `Stratified graph dependency check failed with ${String(violations.length)} violation(s):\n${lines.join('\n')}\n`
  );
  process.exitCode = 1;
}

void main().catch((error: unknown) => {
  process.stderr.write(`Failed to run stratified graph dependency check: ${String(error)}\n`);
  process.exitCode = 1;
});
