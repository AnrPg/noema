import Link from 'next/link';
import type { JSX } from 'react';

export default function ContentCoveragePage(): JSX.Element {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-normal text-slate-950">Concept coverage</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Review active, pending, and metadata-incomplete card coverage by curriculum concept.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        {['Active cards', 'Pending review', 'Metadata incomplete'].map((label) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="text-sm font-medium text-slate-900">{label}</div>
            <div className="mt-3 text-2xl font-semibold text-slate-950">0</div>
          </div>
        ))}
      </section>

      <Link className="text-sm font-medium text-slate-950 underline-offset-4 hover:underline" href="/content/review">
        Open review queue
      </Link>
    </main>
  );
}
