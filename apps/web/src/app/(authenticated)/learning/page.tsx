'use client';

import Link from 'next/link';
import { BookOpen, Brain, ClipboardList, PlayCircle } from 'lucide-react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@noema/ui';

export default function LearningHubPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Learning Hub</h1>
        <p className="text-sm text-muted-foreground">
          This frontend hub is ready even while the deeper orchestration flows are still being wired
          to backend services.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <PlayCircle className="h-5 w-5 text-primary" />
              Start learning
            </CardTitle>
            <CardDescription>Launch a new study session right away.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/session/new">Start Session</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="h-5 w-5 text-primary" />
              Session history
            </CardTitle>
            <CardDescription>Review recent sessions, status, and outcomes.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/sessions">Open Sessions</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Brain className="h-5 w-5 text-primary" />
              Knowledge graph
            </CardTitle>
            <CardDescription>Explore how your studied concepts connect.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/knowledge">Open Knowledge Map</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BookOpen className="h-5 w-5 text-primary" />
            What is already live?
          </CardTitle>
          <CardDescription>
            We can safely expose the frontend before every workflow is fully automated.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>- Session launch and session history are already usable.</p>
          <p>- Reviews and knowledge exploration are available from the sidebar.</p>
          <p>- Goal orchestration and some recommendation flows are still being connected.</p>
        </CardContent>
      </Card>
    </div>
  );
}
