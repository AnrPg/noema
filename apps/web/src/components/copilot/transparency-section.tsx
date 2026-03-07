'use client';
/**
 * @noema/web — Copilot / TransparencySection
 *
 * Shows: Reasoning (blockquote), Assumptions (bulleted list),
 * Context Needed (amber prompts), Constraints (muted list).
 * Each subsection is collapsible.
 */
import * as React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useCopilotStore } from '@/stores/copilot-store';

// ── CollapsibleSection helper ─────────────────────────────────────────────────

interface ICollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: ICollapsibleSectionProps): React.JSX.Element {
  const [open, setOpen] = React.useState(defaultOpen);
  const ChevronIcon = open ? ChevronDown : ChevronRight;
  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        type="button"
        onClick={() => {
          setOpen((p) => !p);
        }}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-muted/30 focus:outline-none"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        <ChevronIcon className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function TransparencySection(): React.JSX.Element {
  const hintsByPage = useCopilotStore((s) => s.hintsByPage);
  const activePageKey = useCopilotStore((s) => s.activePageKey);
  const hints = hintsByPage[activePageKey] ?? [];

  // Aggregate across all hints on this page
  const reasonings = hints.flatMap((h) => (h.reasoning !== undefined ? [h.reasoning] : []));
  const assumptions = [...new Set(hints.flatMap((h) => h.assumptions))];
  const contextNeeded = [...new Set(hints.flatMap((h) => h.contextNeeded))];
  const constraints = [...new Set(hints.flatMap((h) => h.constraints ?? []))];

  const hasAny =
    reasonings.length > 0 ||
    assumptions.length > 0 ||
    contextNeeded.length > 0 ||
    constraints.length > 0;

  if (!hasAny) return <></>;

  return (
    <div className="flex flex-col border-b border-border">
      <div className="px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Transparency
        </h3>
      </div>

      {reasonings.length > 0 && (
        <CollapsibleSection title="Reasoning">
          {reasonings.map((r) => (
            <blockquote
              key={r}
              className="border-l-2 border-synapse-400/40 pl-3 text-xs italic leading-relaxed text-foreground/80"
            >
              {r}
            </blockquote>
          ))}
        </CollapsibleSection>
      )}

      {assumptions.length > 0 && (
        <CollapsibleSection title="Assumptions">
          <ul className="flex flex-col gap-1.5">
            {assumptions.map((a) => (
              <li key={a} className="flex items-start gap-2 text-xs text-foreground/80">
                <span className="mt-0.5 text-muted-foreground">•</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {contextNeeded.length > 0 && (
        <CollapsibleSection title="Context Needed">
          <ul className="flex flex-col gap-1.5">
            {contextNeeded.map((c) => (
              <li key={c} className="text-xs text-amber-600 dark:text-amber-400">
                {c}
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {constraints.length > 0 && (
        <CollapsibleSection title="Constraints" defaultOpen={false}>
          <ul className="flex flex-col gap-1.5">
            {constraints.map((c) => (
              <li key={c} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="mt-0.5">—</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}
    </div>
  );
}
