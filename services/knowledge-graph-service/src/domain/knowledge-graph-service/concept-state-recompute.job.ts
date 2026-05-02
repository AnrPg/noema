import type { Logger } from 'pino';
import type { ConceptStateService } from './concept-state.service.js';

export interface IConceptStateRecomputeJobConfig {
  readonly enabled: boolean;
  readonly intervalMs: number;
  readonly batchSize: number;
  readonly staleAfterMs: number;
}

export class ConceptStateRecomputeJob {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly service: ConceptStateService,
    private readonly config: IConceptStateRecomputeJobConfig,
    private readonly logger: Logger
  ) {}

  start(): void {
    if (!this.config.enabled || this.timer !== undefined) return;
    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.config.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer === undefined) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async drain(): Promise<void> {
    while (this.running) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const staleBefore = new Date(Date.now() - this.config.staleAfterMs).toISOString();
      const result = await this.service.recomputeStale({
        staleBefore,
        limit: this.config.batchSize,
        correlationId: `concept-state-recompute-${Date.now().toString(36)}`,
      });
      this.logger.info({ ...result, staleBefore }, 'Concept state recompute job completed');
    } catch (error) {
      this.logger.error({ error }, 'Concept state recompute job failed');
    } finally {
      this.running = false;
    }
  }
}
