import type { JSX } from 'react';

export default function NewCurriculumPage(): JSX.Element {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-normal text-slate-950">New curriculum</h1>
        <p className="mt-1 text-sm text-slate-600">
          Create a draft path from a goal, then validate it before activation.
        </p>
      </header>
      <form className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5">
        <label className="grid gap-2 text-sm font-medium text-slate-800">
          Goal
          <textarea
            className="min-h-28 rounded-md border border-slate-300 px-3 py-2 font-normal"
            name="goal"
            placeholder="Learn enough linear algebra to understand PCA."
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-slate-800">
          Domain
          <input
            className="rounded-md border border-slate-300 px-3 py-2 font-normal"
            name="domain"
          />
        </label>
        <button
          className="w-fit rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white"
          type="button"
        >
          Generate draft
        </button>
      </form>
    </main>
  );
}
