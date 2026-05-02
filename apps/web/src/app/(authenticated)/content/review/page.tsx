import Link from 'next/link';
import type { JSX } from 'react';

export default function ContentReviewQueuePage(): JSX.Element {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-slate-950">Content review</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Promote or reject generated cards before they become eligible for sessions.
          </p>
        </div>
        <Link className="rounded-md border border-slate-300 px-4 py-2 text-sm" href="/content/jobs">
          Generation jobs
        </Link>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="text-sm font-medium text-slate-900">Pending review</div>
        <p className="mt-2 text-sm text-slate-600">
          Cards in `pending_review` stay out of session selection until a reviewer promotes them.
        </p>
      </section>
    </main>
  );
}
