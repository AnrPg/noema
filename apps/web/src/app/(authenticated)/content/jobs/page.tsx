import Link from 'next/link';
import type { JSX } from 'react';

export default function ContentGenerationJobsPage(): JSX.Element {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-slate-950">Generation jobs</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Track async RAG-grounded and autonomous content generation requests.
          </p>
        </div>
        <Link className="rounded-md border border-slate-300 px-4 py-2 text-sm" href="/content/coverage">
          Coverage
        </Link>
      </header>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Job</th>
              <th className="px-4 py-3 font-medium">Mode</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created cards</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-4 py-4 text-slate-600" colSpan={4}>
                No generation jobs loaded yet.
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  );
}
