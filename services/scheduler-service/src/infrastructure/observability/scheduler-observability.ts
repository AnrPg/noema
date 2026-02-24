type BackpressureState = 'healthy' | 'degraded' | 'throttled';

type ErrorCategory = 'auth' | 'validation' | 'conflict' | 'dependency' | 'internal';

interface ILatencyWindow {
  readonly values: number[];
  readonly maxSize: number;
}

interface ISpanRecord {
  name: string;
  traceId: string;
  correlationId?: string;
  component?: string;
  durationMs: number;
  success: boolean;
  timestamp: string;
}

interface IThroughputCounters {
  proposals: number;
  commits: number;
}

interface IBackpressureThresholds {
  queueLagDegraded: number;
  queueLagThrottled: number;
  dlqDepthDegraded: number;
  dlqDepthThrottled: number;
  p95LatencyMsDegraded: number;
  p95LatencyMsThrottled: number;
  errorRateDegraded: number;
  errorRateThrottled: number;
}

function createWindow(maxSize: number): ILatencyWindow {
  return { values: [], maxSize };
}

function pushWindow(window: ILatencyWindow, value: number): void {
  window.values.push(value);
  if (window.values.length > window.maxSize) {
    window.values.shift();
  }
}

function percentile(values: number[], q: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index] ?? 0;
}

export class SchedulerObservability {
  private readonly requestLatencyWindow = createWindow(5000);
  private readonly recomputeLatencyWindow = createWindow(2000);
  private readonly spans: ISpanRecord[] = [];
  private readonly spansMaxSize = 5000;
  private readonly errorCounters = new Map<string, number>();
  private readonly throughput: IThroughputCounters = {
    proposals: 0,
    commits: 0,
  };

  private totalRequests = 0;
  private queueLag = 0;
  private dlqDepth = 0;

  private readonly thresholds: IBackpressureThresholds = {
    queueLagDegraded: parseInt(process.env['OBS_QUEUE_LAG_DEGRADED'] ?? '100', 10),
    queueLagThrottled: parseInt(process.env['OBS_QUEUE_LAG_THROTTLED'] ?? '500', 10),
    dlqDepthDegraded: parseInt(process.env['OBS_DLQ_DEPTH_DEGRADED'] ?? '10', 10),
    dlqDepthThrottled: parseInt(process.env['OBS_DLQ_DEPTH_THROTTLED'] ?? '100', 10),
    p95LatencyMsDegraded: parseInt(process.env['OBS_P95_LATENCY_MS_DEGRADED'] ?? '600', 10),
    p95LatencyMsThrottled: parseInt(process.env['OBS_P95_LATENCY_MS_THROTTLED'] ?? '1500', 10),
    errorRateDegraded: Number.parseFloat(process.env['OBS_ERROR_RATE_DEGRADED'] ?? '0.05'),
    errorRateThrottled: Number.parseFloat(process.env['OBS_ERROR_RATE_THROTTLED'] ?? '0.15'),
  };

  startSpan(
    name: string,
    context: {
      traceId: string;
      correlationId?: string;
      component?: string;
    }
  ): {
    end: (success?: boolean) => number;
  } {
    const startedAt = Date.now();
    let ended = false;

    return {
      end: (success = true): number => {
        if (ended) {
          return 0;
        }
        ended = true;

        const durationMs = Date.now() - startedAt;
        const spanRecord: ISpanRecord = {
          name,
          traceId: context.traceId,
          durationMs,
          success,
          timestamp: new Date().toISOString(),
        };

        if (context.correlationId !== undefined) {
          spanRecord.correlationId = context.correlationId;
        }

        if (context.component !== undefined) {
          spanRecord.component = context.component;
        }

        this.spans.push(spanRecord);

        if (this.spans.length > this.spansMaxSize) {
          this.spans.shift();
        }

        return durationMs;
      },
    };
  }

  recordRequestLatency(durationMs: number): void {
    this.totalRequests += 1;
    pushWindow(this.requestLatencyWindow, durationMs);
  }

  recordError(category: ErrorCategory, code: string): void {
    const key = `${category}:${code}`;
    const current = this.errorCounters.get(key) ?? 0;
    this.errorCounters.set(key, current + 1);
  }

  recordProposalThroughput(count = 1): void {
    this.throughput.proposals += count;
  }

  recordCommitThroughput(count = 1): void {
    this.throughput.commits += count;
  }

  recordRecomputeLatency(durationMs: number): void {
    pushWindow(this.recomputeLatencyWindow, durationMs);
  }

  updateQueueLag(queueLag: number): void {
    this.queueLag = Math.max(0, queueLag);
  }

  updateDlqDepth(dlqDepth: number): void {
    this.dlqDepth = Math.max(0, dlqDepth);
  }

  getSliSnapshot(): {
    requestLatencyMs: { p50: number; p95: number; p99: number };
    errorRatesByCategoryCode: {
      category: ErrorCategory;
      code: string;
      count: number;
      rate: number;
    }[];
    queueLag: number;
    dlqDepth: number;
    proposalCommitThroughput: IThroughputCounters;
    recomputeLatencyMs: { p50: number; p95: number; p99: number };
  } {
    const requestValues = this.requestLatencyWindow.values;
    const recomputeValues = this.recomputeLatencyWindow.values;
    const denominator = this.totalRequests <= 0 ? 1 : this.totalRequests;

    const errorRatesByCategoryCode = [...this.errorCounters.entries()].map(([key, count]) => {
      const [category, ...restCode] = key.split(':');
      return {
        category: category as ErrorCategory,
        code: restCode.join(':'),
        count,
        rate: count / denominator,
      };
    });

    return {
      requestLatencyMs: {
        p50: percentile(requestValues, 0.5),
        p95: percentile(requestValues, 0.95),
        p99: percentile(requestValues, 0.99),
      },
      errorRatesByCategoryCode,
      queueLag: this.queueLag,
      dlqDepth: this.dlqDepth,
      proposalCommitThroughput: { ...this.throughput },
      recomputeLatencyMs: {
        p50: percentile(recomputeValues, 0.5),
        p95: percentile(recomputeValues, 0.95),
        p99: percentile(recomputeValues, 0.99),
      },
    };
  }

  computeBackpressureSignal(): {
    state: BackpressureState;
    reason: string;
    retryAfterMs: number;
  } {
    const sli = this.getSliSnapshot();
    const aggregateErrorRate = sli.errorRatesByCategoryCode.reduce(
      (sum, item) => sum + item.rate,
      0
    );

    const throttledReasons: string[] = [];
    if (sli.queueLag >= this.thresholds.queueLagThrottled) throttledReasons.push('queue_lag');
    if (sli.dlqDepth >= this.thresholds.dlqDepthThrottled) throttledReasons.push('dlq_depth');
    if (sli.requestLatencyMs.p95 >= this.thresholds.p95LatencyMsThrottled)
      throttledReasons.push('p95_latency');
    if (aggregateErrorRate >= this.thresholds.errorRateThrottled)
      throttledReasons.push('error_rate');

    if (throttledReasons.length > 0) {
      return {
        state: 'throttled',
        reason: throttledReasons.join(','),
        retryAfterMs: 5000,
      };
    }

    const degradedReasons: string[] = [];
    if (sli.queueLag >= this.thresholds.queueLagDegraded) degradedReasons.push('queue_lag');
    if (sli.dlqDepth >= this.thresholds.dlqDepthDegraded) degradedReasons.push('dlq_depth');
    if (sli.requestLatencyMs.p95 >= this.thresholds.p95LatencyMsDegraded)
      degradedReasons.push('p95_latency');
    if (aggregateErrorRate >= this.thresholds.errorRateDegraded) degradedReasons.push('error_rate');

    if (degradedReasons.length > 0) {
      return {
        state: 'degraded',
        reason: degradedReasons.join(','),
        retryAfterMs: 1000,
      };
    }

    return {
      state: 'healthy',
      reason: 'stable',
      retryAfterMs: 0,
    };
  }

  getTraceSummary(limit = 100): {
    spanCount: number;
    recentSpans: ISpanRecord[];
  } {
    const recentSpans = this.spans.slice(-limit);
    return {
      spanCount: this.spans.length,
      recentSpans,
    };
  }

  renderPrometheusMetrics(): string {
    const sli = this.getSliSnapshot();
    const backpressure = this.computeBackpressureSignal();

    const lines: string[] = [];

    lines.push('# HELP scheduler_request_latency_ms Request latency in milliseconds');
    lines.push('# TYPE scheduler_request_latency_ms gauge');
    lines.push(
      `scheduler_request_latency_ms{quantile="0.5"} ${sli.requestLatencyMs.p50.toString()}`
    );
    lines.push(
      `scheduler_request_latency_ms{quantile="0.95"} ${sli.requestLatencyMs.p95.toString()}`
    );
    lines.push(
      `scheduler_request_latency_ms{quantile="0.99"} ${sli.requestLatencyMs.p99.toString()}`
    );

    lines.push('# HELP scheduler_recompute_latency_ms Scheduler recompute latency in milliseconds');
    lines.push('# TYPE scheduler_recompute_latency_ms gauge');
    lines.push(
      `scheduler_recompute_latency_ms{quantile="0.5"} ${sli.recomputeLatencyMs.p50.toString()}`
    );
    lines.push(
      `scheduler_recompute_latency_ms{quantile="0.95"} ${sli.recomputeLatencyMs.p95.toString()}`
    );
    lines.push(
      `scheduler_recompute_latency_ms{quantile="0.99"} ${sli.recomputeLatencyMs.p99.toString()}`
    );

    lines.push('# HELP scheduler_queue_lag Queue lag for scheduler consumer group');
    lines.push('# TYPE scheduler_queue_lag gauge');
    lines.push(`scheduler_queue_lag ${sli.queueLag.toString()}`);

    lines.push('# HELP scheduler_dlq_depth Dead-letter queue depth');
    lines.push('# TYPE scheduler_dlq_depth gauge');
    lines.push(`scheduler_dlq_depth ${sli.dlqDepth.toString()}`);

    lines.push('# HELP scheduler_throughput_total Throughput counters for proposals and commits');
    lines.push('# TYPE scheduler_throughput_total counter');
    lines.push(
      `scheduler_throughput_total{kind="proposal"} ${sli.proposalCommitThroughput.proposals.toString()}`
    );
    lines.push(
      `scheduler_throughput_total{kind="commit"} ${sli.proposalCommitThroughput.commits.toString()}`
    );

    lines.push('# HELP scheduler_error_rate Error rate by category and code');
    lines.push('# TYPE scheduler_error_rate gauge');
    for (const errorRate of sli.errorRatesByCategoryCode) {
      lines.push(
        `scheduler_error_rate{category="${errorRate.category}",code="${errorRate.code}"} ${errorRate.rate.toString()}`
      );
    }

    lines.push('# HELP scheduler_backpressure_state Backpressure state as enum values');
    lines.push('# TYPE scheduler_backpressure_state gauge');
    lines.push(
      `scheduler_backpressure_state{state="healthy"} ${(backpressure.state === 'healthy' ? 1 : 0).toString()}`
    );
    lines.push(
      `scheduler_backpressure_state{state="degraded"} ${(backpressure.state === 'degraded' ? 1 : 0).toString()}`
    );
    lines.push(
      `scheduler_backpressure_state{state="throttled"} ${(backpressure.state === 'throttled' ? 1 : 0).toString()}`
    );

    return `${lines.join('\n')}\n`;
  }
}

export const schedulerObservability = new SchedulerObservability();
