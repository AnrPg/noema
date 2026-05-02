'use client';
/**
 * @noema/web — Reviews / ReviewForecastFull
 *
 * Full-width 7-day concept forecast with day-click expansion.
 * Extends the compact ReviewForecast from the Dashboard.
 */
import * as React from 'react';
import { useDueConcepts } from '@noema/api-client';
import type { StudyMode, UserId } from '@noema/types';
import { Loader2 } from 'lucide-react';

// ── Helpers ─────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const BAR_MAX_H = 72; // px

function localDateStr(d: Date): string {
  const y = String(d.getFullYear());
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface IDayData {
  label: string;
  date: string;
  isToday: boolean;
  fsrs: number;
  hlr: number;
  windows: {
    startAt: string;
    endAt: string;
    lane: 'fsrs' | 'hlr';
    conceptsDue: number;
  }[];
}

function buildWindows(date: string, fsrs: number, hlr: number): IDayData['windows'] {
  const estimatedMinutes = (fsrs + hlr) * 2;
  const blocks = [
    { lane: 'fsrs' as const, conceptsDue: fsrs, startHour: 9 },
    { lane: 'hlr' as const, conceptsDue: hlr, startHour: 13 },
  ].filter((block) => block.conceptsDue > 0);

  return blocks.map((block) => {
    const durationMinutes = Math.max(
      20,
      Math.round((estimatedMinutes * block.conceptsDue) / Math.max(fsrs + hlr, 1))
    );
    const startAt = new Date(`${date}T${String(block.startHour).padStart(2, '0')}:00:00`);
    const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
    return {
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      lane: block.lane,
      conceptsDue: block.conceptsDue,
    };
  });
}

function buildDays(concepts: { dueAt: string; algorithm: string }[]): IDayData[] {
  const today = localDateStr(new Date());
  const counts = new Map<string, { fsrs: number; hlr: number }>();

  for (const concept of concepts) {
    const dueDate = localDateStr(new Date(concept.dueAt));
    const current = counts.get(dueDate) ?? { fsrs: 0, hlr: 0 };
    if (concept.algorithm === 'hlr') {
      current.hlr += 1;
    } else {
      current.fsrs += 1;
    }
    counts.set(dueDate, current);
  }

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = localDateStr(d);
    const source = counts.get(dateStr);
    const fsrs = source?.fsrs ?? 0;
    const hlr = source?.hlr ?? 0;
    return {
      label: DAY_LABELS[d.getDay()] ?? 'Day',
      date: dateStr,
      isToday: dateStr === today,
      fsrs,
      hlr,
      windows: buildWindows(dateStr, fsrs, hlr),
    };
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface IReviewForecastFullProps {
  userId: UserId;
  studyMode: StudyMode;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ReviewForecastFull({
  userId,
  studyMode,
}: IReviewForecastFullProps): React.JSX.Element {
  const { data: dueConceptsData, isLoading } = useDueConcepts(
    { studyMode, limit: 500 },
    { enabled: userId !== '' }
  );

  const [expandedDate, setExpandedDate] = React.useState<string | null>(null);

  const days = React.useMemo(
    () => buildDays(dueConceptsData?.data.concepts ?? []),
    [dueConceptsData]
  );
  const maxTotal = Math.max(...days.map((d) => d.fsrs + d.hlr), 1);
  const expandedDay =
    expandedDate !== null ? (days.find((d) => d.date === expandedDate) ?? null) : null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        Loading forecast…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card px-6 py-6">
      <h3 className="text-base font-semibold text-foreground">7-Day Concept Forecast</h3>

      {/* Bar chart */}
      <div className="flex items-end gap-2" style={{ height: `${String(BAR_MAX_H + 24)}px` }}>
        {days.map((day) => {
          const total = day.fsrs + day.hlr;
          const barH = total > 0 ? Math.max(4, Math.round((total / maxTotal) * BAR_MAX_H)) : 2;
          const retH = total > 0 ? Math.round((day.fsrs / total) * barH) : 0;
          const calH = barH - retH;
          const isExpanded = expandedDate === day.date;

          return (
            <button
              key={day.date}
              type="button"
              onClick={() => {
                setExpandedDate((prev) => (prev === day.date ? null : day.date));
              }}
              className={[
                'flex flex-1 flex-col items-center gap-1 focus:outline-none focus:ring-2 focus:ring-ring rounded-sm',
                day.isToday ? 'ring-1 ring-synapse-400/50' : '',
              ].join(' ')}
            >
              <div
                className="flex w-full flex-col justify-end overflow-hidden rounded-sm"
                style={{ height: `${String(BAR_MAX_H)}px` }}
              >
                {retH > 0 && (
                  <div
                    className={[
                      'w-full bg-synapse-400/80 transition-all',
                      isExpanded ? 'bg-synapse-400' : '',
                    ].join(' ')}
                    style={{ height: `${String(retH)}px` }}
                  />
                )}
                {calH > 0 && (
                  <div
                    className={[
                      'w-full bg-myelin-400/80 transition-all',
                      isExpanded ? 'bg-myelin-400' : '',
                    ].join(' ')}
                    style={{ height: `${String(calH)}px` }}
                  />
                )}
                {total === 0 && (
                  <div className="w-full rounded-sm bg-muted" style={{ height: '2px' }} />
                )}
              </div>
              <span
                className={[
                  'text-[10px] font-medium',
                  day.isToday ? 'text-synapse-400' : 'text-muted-foreground',
                ].join(' ')}
              >
                {day.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-synapse-400" />
          FSRS
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-myelin-400" />
          HLR
        </span>
      </div>

      {/* Expanded day detail */}
      {expandedDay !== null && (
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              {formatShortDate(expandedDay.date)}
              {expandedDay.isToday ? ' — Today' : ''}
            </p>
            <button
              type="button"
              onClick={() => {
                setExpandedDate(null);
              }}
              aria-label="Close day detail"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          {expandedDay.windows.length === 0 ? (
            <p className="text-xs text-muted-foreground">No concepts due this day.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {expandedDay.windows.map((w, i) => (
                <div
                  key={`${w.startAt}-${String(i)}`}
                  className="flex items-center justify-between rounded border border-border bg-card px-3 py-1.5 text-xs"
                >
                  <span className="text-muted-foreground">
                    {formatTime(w.startAt)} – {formatTime(w.endAt)}
                  </span>
                  <span
                    className={[
                      'font-medium',
                      w.lane === 'fsrs' ? 'text-synapse-400' : 'text-myelin-400',
                    ].join(' ')}
                  >
                    {w.lane.toUpperCase()}
                  </span>
                  <span className="tabular-nums text-foreground">
                    {String(w.conceptsDue)} concepts
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
