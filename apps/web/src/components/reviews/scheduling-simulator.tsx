'use client';
/**
 * @noema/web — Reviews / SchedulingSimulator (stub)
 * Full implementation in T9.3.
 */
import * as React from 'react';
import type { UserId } from '@noema/types';

export interface ISchedulingSimulatorProps {
  userId: UserId;
}

export function SchedulingSimulator({
  userId: _userId,
}: ISchedulingSimulatorProps): React.JSX.Element {
  return (
    <div className="rounded-xl border border-border bg-card px-6 py-6 text-sm text-muted-foreground">
      Scheduling Simulator loading…
    </div>
  );
}
