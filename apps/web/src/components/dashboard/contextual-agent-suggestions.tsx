'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@noema/ui';
import { AgentActionButton } from '@/features/agents';

export function ContextualAgentSuggestions(props: {
  userId: string;
  sessionId?: string;
  studyMode: string;
}): React.JSX.Element {
  const baseContext = {
    userId: props.userId,
    studyMode: props.studyMode,
    ...(props.sessionId !== undefined ? { sessionId: props.sessionId } : {}),
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Available at the right moment</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Agents stay quiet until a workflow has enough context for a useful action.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="rounded-lg border border-border/70 bg-background/70 p-3">
          <p className="text-sm font-medium text-foreground">Learning readout</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use this when the dashboard raises a question about progress or confidence.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <AgentActionButton
              agentName="cognitive-copilot"
              context={baseContext}
              label="Summarize now"
              size="sm"
            />
            <AgentActionButton
              agentName="calibration-coach"
              context={baseContext}
              label="Check confidence"
              size="sm"
            />
          </div>
        </div>
        <div className="rounded-lg border border-border/70 bg-background/70 p-3">
          <p className="text-sm font-medium text-foreground">Repair suggestions</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use this after a session or weak concept signal to draft a tiny repair.
          </p>
          <div className="mt-3">
            <AgentActionButton
              agentName="patch-planner-remediation-agent"
              context={baseContext}
              label="Draft repair"
              size="sm"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
