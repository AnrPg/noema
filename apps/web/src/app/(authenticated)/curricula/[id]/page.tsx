import type { JSX } from 'react';

export default function CurriculumDetailPage({ params }: { params: { id: string } }): JSX.Element {
  const nodes = ['Algebra basics', 'Linear equations', 'Vectors', 'Matrix transforms'];
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[1.3fr_0.7fr]">
      <section className="grid gap-4">
        <header>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{params.id}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">
            Curriculum outline
          </h1>
        </header>
        <div className="min-h-96 rounded-lg border border-slate-200 bg-white p-5">
          <div className="grid gap-3">
            {nodes.map((node, index) => (
              <div
                key={node}
                className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2"
              >
                <span className="grid size-7 place-items-center rounded-full bg-slate-950 text-xs font-medium text-white">
                  {index + 1}
                </span>
                <span className="text-sm font-medium text-slate-900">{node}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <aside className="grid h-fit gap-4">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-950">Revision proposals</h2>
          <div className="mt-3 rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-600">
            No pending structural revisions.
          </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-950">Frontier</h2>
          <p className="mt-2 text-sm text-slate-600">
            Next session will draw from unlocked or in-progress nodes.
          </p>
        </section>
      </aside>
    </main>
  );
}
