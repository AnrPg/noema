'use client';

import type {
  IOntologyImportRunDetailDto,
  IOntologyImportRunDto,
  OntologyImportStatus,
} from '@noema/api-client';

const ACTIVE_RUN_STATUSES: OntologyImportStatus[] = [
  'queued',
  'fetching',
  'fetched',
  'parsing',
  'parsed',
];

interface IRunTone {
  badgeClassName: string;
  cardClassName: string;
}

export function isOntologyImportRunActive(status: OntologyImportStatus): boolean {
  return ACTIVE_RUN_STATUSES.includes(status);
}

export function formatOntologyImportStatus(status: OntologyImportStatus): string {
  return status.replaceAll('_', ' ');
}

export function describeOntologyImportSourceVersion(
  run: Pick<IOntologyImportRunDto, 'status' | 'sourceVersion'>
): string {
  if (run.sourceVersion !== null && run.sourceVersion !== '') {
    return run.sourceVersion;
  }

  switch (run.status) {
    case 'failed':
      return 'release unavailable';
    case 'cancelled':
      return 'release not captured';
    case 'review_submitted':
    case 'ready_for_review':
      return 'release unspecified';
    default:
      return 'release pending';
  }
}

export function describeOntologyImportRunVersion(
  run: Pick<IOntologyImportRunDetailDto['run'], 'status' | 'sourceVersion'>
): string {
  if (run.sourceVersion !== null && run.sourceVersion !== '') {
    return run.sourceVersion;
  }

  switch (run.status) {
    case 'failed':
      return 'Unavailable for failed run';
    case 'cancelled':
      return 'Not captured before cancellation';
    case 'review_submitted':
    case 'ready_for_review':
      return 'Not reported by source';
    default:
      return 'Pending discovery';
  }
}

export function getOntologyImportRunTone(status: OntologyImportStatus): IRunTone {
  switch (status) {
    case 'failed':
      return {
        badgeClassName: 'border-red-400/30 bg-red-500/10 text-red-200',
        cardClassName: 'border-red-400/20 bg-red-500/[0.045]',
      };
    case 'cancelled':
      return {
        badgeClassName: 'border-zinc-400/30 bg-zinc-500/10 text-zinc-200',
        cardClassName: 'border-zinc-400/20 bg-zinc-500/[0.04]',
      };
    case 'review_submitted':
      return {
        badgeClassName: 'border-violet-400/30 bg-violet-500/10 text-violet-200',
        cardClassName: 'border-violet-400/20 bg-violet-500/[0.045]',
      };
    case 'ready_for_review':
      return {
        badgeClassName: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
        cardClassName: 'border-emerald-400/20 bg-emerald-500/[0.045]',
      };
    case 'queued':
      return {
        badgeClassName: 'border-amber-400/30 bg-amber-500/10 text-amber-200',
        cardClassName: 'border-amber-400/20 bg-amber-500/[0.04]',
      };
    default:
      return {
        badgeClassName: 'border-blue-400/30 bg-blue-500/10 text-blue-200',
        cardClassName: 'border-blue-400/20 bg-blue-500/[0.04]',
      };
  }
}
