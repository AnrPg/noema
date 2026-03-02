/**
 * @noema/knowledge-graph-service — Observability Module
 *
 * Provides OpenTelemetry tracing and Prometheus-style counters for the
 * knowledge-graph service. Uses @opentelemetry/api as the sole dependency:
 *
 * - If an OTel SDK is registered (production), spans export to Jaeger via OTLP.
 * - If no SDK is registered (tests, dev), all spans are no-ops (zero overhead).
 *
 * This module provides:
 * - `kgTracer`: Named tracer for the knowledge-graph-service
 * - `withSpan()`: Helper to wrap async operations in a trace span
 * - `ServiceCounters`: In-memory Prometheus-style counters for key metrics
 *
 * @see ADR-013 for observability integration rationale (Fix 4.7)
 */

import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { Span, SpanOptions } from '@opentelemetry/api';

// ---------------------------------------------------------------------------
// Named Tracer
// ---------------------------------------------------------------------------

/** Named tracer for the knowledge-graph service domain layer. */
export const kgTracer = trace.getTracer('@noema/knowledge-graph-service', '0.1.0');

// ---------------------------------------------------------------------------
// Span Helper
// ---------------------------------------------------------------------------

/**
 * Wrap an async operation in a trace span. Sets span status automatically
 * and records exceptions on failure.
 *
 * @example
 * ```ts
 * const result = await withSpan('pkg.createNode', async (span) => {
 *   span.setAttribute('kg.userId', userId);
 *   return this.pkgWrite.createNode(userId, input, context);
 * });
 * ```
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: SpanOptions
): Promise<T> {
  return kgTracer.startActiveSpan(name, options ?? {}, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}

// ---------------------------------------------------------------------------
// Service Counters (Prometheus-compatible)
// ---------------------------------------------------------------------------

/** Counter entry for tracking operation counts. */
interface ICounterEntry {
  readonly name: string;
  readonly labels: Record<string, string>;
  value: number;
}

/**
 * In-memory counters for key knowledge-graph-service metrics.
 * Designed to be scraped by a Prometheus-compatible /metrics endpoint.
 *
 * Uses an append-only map keyed by `name + labels`. Thread-safe for
 * single-threaded Node.js (no mutex needed).
 */
export class ServiceCounters {
  private readonly counters = new Map<string, ICounterEntry>();

  /** Increment a counter by 1 (default) or a custom amount. */
  increment(name: string, labels: Record<string, string> = {}, amount = 1): void {
    const key = this.makeKey(name, labels);
    const existing = this.counters.get(key);
    if (existing !== undefined) {
      existing.value += amount;
    } else {
      this.counters.set(key, { name, labels, value: amount });
    }
  }

  /** Get current value for a counter. Returns 0 if not found. */
  get(name: string, labels: Record<string, string> = {}): number {
    return this.counters.get(this.makeKey(name, labels))?.value ?? 0;
  }

  /** Reset all counters (test helper). */
  reset(): void {
    this.counters.clear();
  }

  /**
   * Render all counters in Prometheus exposition format.
   * Lines sorted by counter name for deterministic output.
   */
  toPrometheusText(): string {
    const entries = [...this.counters.values()].sort((a, b) => a.name.localeCompare(b.name));
    const lines: string[] = [];

    for (const entry of entries) {
      const labelStr = Object.entries(entry.labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      const suffix = labelStr.length > 0 ? `{${labelStr}}` : '';
      lines.push(`${entry.name}${suffix} ${String(entry.value)}`);
    }

    return lines.join('\n');
  }

  /** Snapshot all counters (for testing / health endpoints). */
  snapshot(): ReadonlyMap<string, { name: string; labels: Record<string, string>; value: number }> {
    return new Map(this.counters);
  }

  private makeKey(name: string, labels: Record<string, string>): string {
    const labelParts = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}|${labelParts}`;
  }
}

// ---------------------------------------------------------------------------
// Well-known Counter Names
// ---------------------------------------------------------------------------

/** Standard counter names for the knowledge-graph-service. */
export const KG_COUNTERS = {
  /** PKG node/edge operations by type (create/read/update/delete). */
  PKG_OPERATIONS: 'kg_pkg_operations_total',
  /** CKG mutation pipeline operations by state transition. */
  CKG_MUTATIONS: 'kg_ckg_mutations_total',
  /** Metrics computation events. */
  METRICS_COMPUTED: 'kg_metrics_computed_total',
  /** Misconceptions detected. */
  MISCONCEPTIONS_DETECTED: 'kg_misconceptions_detected_total',
  /** Staleness mark failures (post-write resilience). */
  STALENESS_MARK_FAILURES: 'kg_staleness_mark_failures_total',
  /** Operation log append failures. */
  OPERATION_LOG_FAILURES: 'kg_operation_log_failures_total',
  /** Event publish failures. */
  EVENT_PUBLISH_FAILURES: 'kg_event_publish_failures_total',
  /** Pipeline stage transitions (proposed → validating → committed etc). */
  PIPELINE_STAGES: 'kg_pipeline_stage_transitions_total',
  /** Graph read operations by type (traversal, analysis, ordering). */
  GRAPH_READS: 'kg_graph_reads_total',
  /** Cross-DB inconsistencies detected (Neo4j ↔ Postgres). */
  CROSS_DB_INCONSISTENCIES: 'kg_cross_db_inconsistencies_total',
} as const;

// ---------------------------------------------------------------------------
// Singleton Counters Instance
// ---------------------------------------------------------------------------

/** Global counters instance for the knowledge-graph-service. */
export const kgCounters = new ServiceCounters();
