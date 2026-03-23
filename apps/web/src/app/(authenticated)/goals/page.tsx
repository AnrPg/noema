'use client';

import Link from 'next/link';
import { CalendarClock, Flag, Sparkles, Target } from 'lucide-react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@noema/ui';

export default function GoalsPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Goals</h1>
        <p className="text-sm text-muted-foreground">
          The goals workspace is now available as a frontend-first surface while persistence and
          automation are still being wired in.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5 text-primary" />
              Daily target
            </CardTitle>
            <CardDescription>Keep your study rhythm visible and easy to adjust.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Draft UI only for now. The saved backend goal model is the next step.</p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/settings">Adjust study preferences</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarClock className="h-5 w-5 text-primary" />
              Weekly plan
            </CardTitle>
            <CardDescription>
              Shape your next few study windows before the scheduler lands.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Use the review forecast today; saved weekly plans are still coming.</p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/reviews">Open Reviews</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Flag className="h-5 w-5 text-primary" />
              Mastery campaigns
            </CardTitle>
            <CardDescription>
              Track longer-term objectives across concepts and sessions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Campaign definitions are not persisted yet, but the page is ready for that flow.</p>
            <Button asChild className="w-full">
              <Link href="/knowledge">Explore Knowledge Map</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            What comes next?
          </CardTitle>
          <CardDescription>
            This page is intentionally live before the backend contract is finished.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>- Save named goals and campaigns.</p>
          <p>- Tie goals to review forecasts, session outcomes, and PKG growth.</p>
          <p>- Add reminders, deadlines, and progress rollups once the API is ready.</p>
        </CardContent>
      </Card>
    </div>
  );
}
