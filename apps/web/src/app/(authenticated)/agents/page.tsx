'use client';

import Link from 'next/link';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@noema/ui';
import type { Route } from 'next';

const destinations: { href: Route; title: string; description: string }[] = [
  {
    href: '/dashboard',
    title: 'Dashboard',
    description: 'Copilot and calibration actions appear alongside learning vitals.',
  },
  {
    href: '/session/new',
    title: 'Session setup',
    description: 'Lesson planning appears before a curriculum-bound session starts.',
  },
  {
    href: '/content/jobs',
    title: 'Content generation',
    description: 'Content agents appear when a concept needs more practice material.',
  },
  {
    href: '/knowledge',
    title: 'Knowledge map',
    description: 'Graph agents appear when selected concepts need anchors or structure.',
  },
];

export default function AgentsPage(): React.JSX.Element {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
      <header>
        <h1 className="text-3xl font-bold text-foreground">Agents are embedded in your work</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Noema surfaces agents as contextual actions, review prompts, and explanations inside the
          screens where they have enough context to help.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {destinations.map((destination) => (
          <Card key={destination.href}>
            <CardHeader>
              <CardTitle className="text-sm">{destination.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{destination.description}</p>
              <Button asChild variant="outline" className="mt-4">
                <Link href={destination.href}>Open</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Advanced runtime debug</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-muted-foreground">
            The raw wrapper runner is still available for development and contract inspection, but
            it is no longer the primary learner experience.
          </p>
          <Button asChild variant="outline">
            <Link href="/agents/debug">Open debug workbench</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
