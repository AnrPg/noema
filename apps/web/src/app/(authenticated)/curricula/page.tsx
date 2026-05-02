import Link from 'next/link';
import type { JSX } from 'react';

const demoCurricula = [
  {
    id: 'curr_demo_foundations',
    title: 'Foundations',
    state: 'Active',
    frontier: 3,
    progress: '8 / 24',
  },
  {
    id: 'curr_demo_maintenance',
    title: 'Maintenance',
    state: 'Hidden',
    frontier: 12,
    progress: 'system managed',
  },
];

export default function CurriculaPage(): JSX.Element {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-slate-950">Curricula</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Versioned learning paths, traversal frontiers, and revision proposals.
          </p>
        </div>
        <Link
          href="/curricula/new"
          className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white"
        >
          New curriculum
        </Link>
      </header>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">State</th>
              <th className="px-4 py-3 font-medium">Frontier</th>
              <th className="px-4 py-3 font-medium">Progress</th>
            </tr>
          </thead>
          <tbody>
            {demoCurricula.map((curriculum) => (
              <tr key={curriculum.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <Link
                    className="font-medium text-slate-950 underline-offset-4 hover:underline"
                    href={`/curricula/${curriculum.id}`}
                  >
                    {curriculum.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{curriculum.state}</td>
                <td className="px-4 py-3 text-slate-700">{curriculum.frontier}</td>
                <td className="px-4 py-3 text-slate-700">{curriculum.progress}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
