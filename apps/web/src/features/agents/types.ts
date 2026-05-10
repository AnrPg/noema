import type {
  IAgentBatchJob,
  IAgentRunRequest,
  IAgentRunResult,
  IReviewRoutingDecision,
} from '@noema/api-client/agents';

export type EmbeddedAgentName =
  | 'cognitive-copilot'
  | 'mental-debugger'
  | 'calibration-coach'
  | 'patch-planner-remediation-agent'
  | 'strategy-replanning-agent'
  | 'ingestion-concept-extraction-agent'
  | 'knowledge-graph-agent'
  | 'curriculum-outline-planner'
  | 'curriculum-planner'
  | 'curriculum-revision-agent'
  | 'content-creation-orchestrator'
  | 'content-creator-agent'
  | 'lesson-plan-generator'
  | 'mode-preference-helper';

export type AgentSurface =
  | 'dashboard'
  | 'active-session'
  | 'session-summary'
  | 'curriculum'
  | 'content'
  | 'knowledge'
  | 'copilot'
  | 'debug';

export type AgentReviewState =
  | 'idle'
  | 'checking'
  | 'blocked'
  | 'draft'
  | 'needs_review'
  | 'guardian_accepted'
  | 'guardian_blocked'
  | 'running'
  | 'cancelled'
  | 'failed'
  | 'completed';

export type ProposalJobPhase =
  | 'idle'
  | 'queued_local'
  | 'submitted_provider'
  | 'running_provider'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface IAgentCapability {
  name: EmbeddedAgentName;
  title: string;
  shortLabel: string;
  description: string;
  preparationDescription?: string;
  surface: AgentSurface[];
  whenToSurface: string;
  actionLabel: string;
  requiredContext: (keyof IAgentRunRequest)[];
  defaultExecution: 'realtime' | 'batch' | 'auto';
  reviewRoute?: string;
  learnerVisible: boolean;
  risk: 'low' | 'medium' | 'high';
}

export interface IAgentProvenance {
  runId?: string | null;
  jobId?: string | null;
  agentName: EmbeddedAgentName;
  provider?: string | null;
  model?: string | null;
  promptTemplateId?: string | null;
  reviewQueue?: string | null;
  serviceRefs: Record<string, unknown>;
}

export interface IAgentProposal {
  id: string;
  agentName: EmbeddedAgentName;
  title: string;
  summary: string;
  state: AgentReviewState;
  headline: string;
  recommendedAction: string;
  nextStepLabel: string;
  nextStepDescription: string;
  reasons: string[];
  friendlyReasons: string[];
  caution: string | null;
  review?: IReviewRoutingDecision;
  rawResult?: IAgentRunResult;
  technicalDetails: IAgentProvenance & {
    reviewRequired: boolean;
    rawReasons: string[];
    blockedReasons: string[];
  };
  provenance: IAgentProvenance;
}

export interface IAgentJobView {
  id: string;
  agentName: EmbeddedAgentName;
  status: AgentReviewState;
  label: string;
  updatedAt?: string;
  rawJob?: IAgentBatchJob;
}
