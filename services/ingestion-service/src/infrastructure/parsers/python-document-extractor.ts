import { spawn } from 'node:child_process';
import { accessSync, constants as fsConstants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IDocumentDto } from '@noema/contracts';
import type { IParsedDocument } from '../../domain/ingestion-service/external-ports.js';
import type { DocumentFormat } from '../../domain/ingestion-service/pipeline.js';
import { isDocumentFormat, parseDocumentContent } from '../../domain/ingestion-service/pipeline.js';
import { resolveDocumentPayload } from './document-payload.js';

export interface IPythonExtractionResult {
  text: string;
  warnings: { code: string; message: string }[];
  metadata: Record<string, unknown>;
  parseMode?: DocumentFormat;
  sourceFormat?: string;
}

export interface IPythonDocumentExtractorOptions {
  pythonExecutable?: string | undefined;
  scriptPath?: string | undefined;
  timeoutMs?: number | undefined;
}

export class PythonBackedDocumentParser {
  private readonly pythonExecutable: string;
  private readonly scriptPath: string;
  private readonly timeoutMs: number;

  constructor(options: IPythonDocumentExtractorOptions = {}) {
    this.pythonExecutable = options.pythonExecutable ?? process.env['INGESTION_PYTHON_PATH'] ?? 'python';
    this.scriptPath = options.scriptPath ?? resolveExtractorScriptPath();
    this.timeoutMs = options.timeoutMs ?? Number(process.env['INGESTION_PARSER_TIMEOUT_MS'] ?? 30_000);
  }

  async parse(document: IDocumentDto, content: string): Promise<IParsedDocument> {
    const payload = resolveDocumentPayload(document, content);
    const extraction = await this.extract(document, payload);
    const parsed = parseDocumentContent(document, extraction.text, {
      parseMode: extraction.parseMode,
      sourceFormat: extraction.sourceFormat,
      metadata: extraction.metadata,
    });
    return {
      ...parsed,
      parseWarnings: [...(parsed.parseWarnings ?? []), ...extraction.warnings],
    };
  }

  private async extract(
    document: IDocumentDto,
    payload: ReturnType<typeof resolveDocumentPayload>
  ): Promise<IPythonExtractionResult> {
    const raw = await this.runExtractor({
      title: document.title,
      mimeKind: payload.mimeKind,
      sourceFormat: typeof document.metadata['documentFormat'] === 'string' ? document.metadata['documentFormat'] : undefined,
      encoding: payload.encoding,
      content: payload.encoding === 'base64' ? payload.content : payload.bytes.toString('utf8'),
    });
    const parseMode =
      typeof raw['parseMode'] === 'string' && isDocumentFormat(raw['parseMode'])
        ? raw['parseMode']
        : undefined;
    const sourceFormat = typeof raw['sourceFormat'] === 'string' ? raw['sourceFormat'] : undefined;
    return {
      text: typeof raw['text'] === 'string' ? raw['text'] : '',
      warnings: normalizeWarnings(raw['warnings']),
      metadata:
        typeof raw['metadata'] === 'object' && raw['metadata'] !== null
          ? (raw['metadata'] as Record<string, unknown>)
          : {},
      ...(parseMode !== undefined ? { parseMode } : {}),
      ...(sourceFormat !== undefined ? { sourceFormat } : {}),
    };
  }

  private runExtractor(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return new Promise((resolvePromise, rejectPromise) => {
      const child = spawn(this.pythonExecutable, [this.scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      const timer = setTimeout(() => {
        child.kill();
        rejectPromise(new Error(`Document extraction timed out after ${String(this.timeoutMs)}ms.`));
      }, this.timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
      child.on('error', (error) => {
        clearTimeout(timer);
        rejectPromise(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          rejectPromise(
            new Error(
              `Document extraction failed with exit code ${String(code)}: ${Buffer.concat(stderr).toString('utf8').trim()}`
            )
          );
          return;
        }
        try {
          const parsed = JSON.parse(Buffer.concat(stdout).toString('utf8')) as Record<string, unknown>;
          resolvePromise(parsed);
        } catch (error) {
          rejectPromise(
            new Error(
              `Document extraction returned invalid JSON: ${error instanceof Error ? error.message : 'unknown error'}`
            )
          );
        }
      });
      child.stdin.write(JSON.stringify(input));
      child.stdin.end();
    });
  }
}

function normalizeWarnings(value: unknown): { code: string; message: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const warning = item as Record<string, unknown>;
    return typeof warning['code'] === 'string' && typeof warning['message'] === 'string'
      ? [{ code: warning['code'], message: warning['message'] }]
      : [];
  });
}

function resolveExtractorScriptPath(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), 'scripts', 'extract_document.py'),
    resolve(moduleDir, '../../../scripts/extract_document.py'),
    resolve(moduleDir, '../../../../scripts/extract_document.py'),
  ];
  for (const candidate of candidates) {
    try {
      accessSync(candidate, fsConstants.R_OK);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return candidates[0] ?? 'scripts/extract_document.py';
}
