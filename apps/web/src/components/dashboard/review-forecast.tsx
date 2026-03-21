/**
 * Review Forecast Timeline
 *
 * 7-day horizontal segmented bar chart (retention=synapse, calibration=myelin).
 * Data from useReviewWindows aggregated per day × lane.
 */

'use client';

import { useForecast } from '@noema/api-client';
import type { UserDto } from '@noema/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@noema/ui';
import { useState } from 'react';

type UserId = UserDto['id'];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const BAR_CHART_HEIGHT = 80;
const MAX_DISPLAY_VALUE = 50;

interface IDayData {
  label: string;
  date: string;
  retention: number;
  calibration: number;
  isToday: boolean;
}

function localDateStr(d: Date): string {
  const y = String(d.getFullYear());
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function buildDayData(
  forecastDays: {
    date: string;
    retention: { total: number };
    calibration: { total: number };
  }[]
): IDayData[] {
  const today = localDateStr(new Date());
  return Array.from({ length: 7 }, (_, i) => {
    const source = forecastDays[i];
    const d = source !== undefined ? new Date(`${source.date}T00:00:00`) : new Date();
    if (source === undefined) {
      d.setDate(d.getDate() + i);
    }
    const dateStr = localDateStr(d);
    return {
      label: DAY_LABELS[d.getDay()] ?? 'Day',
      date: dateStr,
      retention: source?.retention.total ?? 0,
      calibration: source?.calibration.total ?? 0,
      isToday: dateStr === today,
    };
  });
}

function ensureForecastDays(
  value: unknown
): {
  date: string;
  retention: { total: number };
  calibration: { total: number };
}[] {
  return Array.isArray(value)
    ? (value as {
        date: string;
        retention: { total: number };
        calibration: { total: number };
      }[])
    : [];
}

export function ReviewForecast({ userId }: { userId: UserId }): React.JSX.Element {
  const forecast = useForecast({ userId, days: 7, includeOverdue: true }, { enabled: userId !== '' });
  const [hoveredDay, setHoveredDay] = useState<IDayData | null>(null);

  if (forecast.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Review Forecast</CardTitle>
          <CardDescription>Next 7 days</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton variant="rect" className="h-28 w-full" />
        </CardContent>
      </Card>
    );
  }

  const days = buildDayData(ensureForecastDays(forecast.data?.data.days));
  const totalWeek = days.reduce((s, d) => s + d.retention + d.calibration, 0);
  const todayData = days[0];
  const todayTotal = (todayData?.retention ?? 0) + (todayData?.calibration ?? 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review Forecast</CardTitle>
        <CardDescription>Next 7 days</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Bar chart */}
          <div
            className="flex items-end gap-1.5"
            style={{ height: `${String(BAR_CHART_HEIGHT)}px` }}
          >
            {days.map((day) => {
              const total = day.retention + day.calibration;
              const innerHeight = BAR_CHART_HEIGHT - 20; // 20px reserved for the day label
              const scale = innerHeight / MAX_DISPLAY_VALUE;
              const cappedTotal = Math.min(total, MAX_DISPLAY_VALUE);
              const retH =
                total > 0 ? Math.round((day.retention / total) * cappedTotal * scale) : 0;
              const calH =
                total > 0 ? Math.round((day.calibration / total) * cappedTotal * scale) : 0;

              return (
                <div
                  key={day.date}
                  className="flex flex-1 cursor-pointer flex-col items-center gap-0.5"
                  onMouseEnter={() => {
                    setHoveredDay(day);
                  }}
                  onMouseLeave={() => {
                    setHoveredDay(null);
                  }}
                >
                  <div
                    className={[
                      'flex w-full flex-col justify-end overflow-hidden rounded-sm transition-opacity',
                      day.isToday
                        ? 'shadow-[0_0_8px] shadow-synapse-400/20 ring-1 ring-synapse-400/50'
                        : '',
                      hoveredDay !== null && hoveredDay.date !== day.date
                        ? 'opacity-50'
                        : 'opacity-100',
                    ].join(' ')}
                    style={{ height: `${String(innerHeight)}px` }}
                  >
                    {retH > 0 && (
                      <div
                        className="w-full rounded-t-sm bg-synapse-400/80 transition-all"
                        style={{ height: `${String(retH)}px` }}
                      />
                    )}
                    {calH > 0 && (
                      <div
                        className="w-full bg-myelin-400/80"
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
                </div>
              );
            })}
          </div>

          {/* Tooltip */}
          {hoveredDay !== null && (
            <div className="pointer-events-none absolute -top-16 left-1/2 z-10 min-w-[140px] -translate-x-1/2 rounded-md border bg-popover px-3 py-1.5 text-xs shadow-md">
              <p className="font-semibold">{hoveredDay.date}</p>
              <p className="text-synapse-400">Retention: {String(hoveredDay.retention)}</p>
              <p className="text-myelin-400">Calibration: {String(hoveredDay.calibration)}</p>
              <p className="text-muted-foreground">
                Total: {String(hoveredDay.retention + hoveredDay.calibration)}
              </p>
            </div>
          )}
        </div>

        {/* Legend + summary */}
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-synapse-400" />
              Retention
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-myelin-400" />
              Calibration
            </span>
          </div>
          <span>
            {String(totalWeek)} reviews this week · {String(todayTotal)} due today
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
